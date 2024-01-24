const { Server } = require('socket.io');
const port = 443;
const { quill, default: Delta } = require('quill-delta');
const fs = require("fs");
const mysql = require("mysql2");
const { createServer } = require("https");
const { convertDeltaToHtml } = require('extended-node-quill-converter');
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const config = JSON.parse(fs.readFileSync("../.server-vars.json"));
const awsBucket = config['aws']['bucket'];
const awsRegion = config['aws']['region'];

var s3client = new S3Client ({region: awsRegion});

const httpsServer = createServer({
  key: fs.readFileSync("../keys/priv.pem"),
  cert: fs.readFileSync("../keys/cert.pem")
});

const server = new Server(httpsServer, {
    cors: {
      origin: config['corsAllow'],
      methods: ["GET", "POST"]
    }
  });

const MysqlConnection = mysql.createConnection(config['db']);
  
// Connecting to database
MysqlConnection.connect(function(err) {
  if(err){
    console.log("Error connecting to MySQL DB")
    console.log(err)
  }
});

  function sanitizeInput(input) {
    return input.replace("/", "").replace("\\", "");
  }

  var documentDeltas = {};
  var roomCounter = {};
  
server.on("connection", async (socket) => {

    var userID = socket.handshake.auth['userID'];

    var fileName = (socket.handshake.auth['fileType'] == 'chapter' ? 'chapter-' + sanitizeInput(socket.handshake.auth['courseID']) + '-' : '') + sanitizeInput(socket.handshake.auth['fileID']);

    if(typeof documentDeltas[socket.handshake.auth['fileID']] == "undefined" || documentDeltas[socket.handshake.auth['fileID']] === null) {
        // Load the document delta into memory
        var command = new GetObjectCommand({
   		Bucket: awsBucket,
    		Key: fileName + ".json"
  	});
  	var res = await s3client.send(command);
  	var str = await res.Body.transformToString();
  	documentDeltas[socket.handshake.auth['fileID']] = new Delta(JSON.parse(str));
    }
    socket.emit("init", documentDeltas[socket.handshake.auth['fileID']]); // read the delta back from memory and send it to the client

    socket.on("delta", data => {
        if(socket.writeAccess) {
            var delta = new Delta(data.delta.ops);
            documentDeltas[socket.handshake.auth['fileID']] = documentDeltas[socket.handshake.auth['fileID']].compose(delta);
            socket.to("d:" + socket.handshake.auth['fileID']).emit("delta", data);
        }
    });

    socket.on("disconnect", () => {
 
        if(socket.writeAccess) {
            /*fs.writeFile(fileName + ".json", JSON.stringify(documentDeltas[socket.handshake.auth['fileID']]), 'utf8', err => {
                console.log(err);
            });*/
            
            var command = new PutObjectCommand({
		    Bucket: awsBucket,
		    Key: fileName + ".json",
		    Body: JSON.stringify(documentDeltas[socket.handshake.auth['fileID']]),
	    });
	    s3client.send(command);
        }

        // Deallocate the memory used for storing the delta in memory
        roomCounter[socket.handshake.auth['fileID']]--;
        if(roomCounter[socket.handshake.auth['fileID']] <= 0) delete documentDeltas[socket.handshake.auth['fileID']];

    });

    socket.on("publish", async () => {
        console.log("publish");
         // When user wants to publish, create an html doc from it which is then published
        var html = await convertDeltaToHtml(documentDeltas[socket.handshake.auth['fileID']]);

        /*fs.writeFile(fileName + ".html", html, 'utf-8', err => {
            console.log(err);
        });*/
        
        var command = new PutObjectCommand({
		    Bucket: awsBucket,
		    Key: fileName + ".html",
		    Body: html,
	    });
	s3client.send(command);

        // Make sure the file is readable to the webserver (may not be by default)
        fs.chmod(fileName + '.html', 777, err => console.log(err));
    });

    socket.on("rename", newName => {
        if(socket.handshake.auth['fileType'] == 'chapter') MysqlConnection.query("UPDATE `chapters` SET name=? WHERE id=?", [newName, socket.handshake.auth['fileID']], (err, res) => { console.log(err); });
        else MysqlConnection.query("UPDATE `documents` SET name=? WHERE id=?", [newName, socket.handshake.auth['fileID']], (err, res) => { console.log(err); });
    });
});

server.use(async (socket, next) => {

	console.log("checking credentials");

    function init(write_access = false) {
        if(typeof roomCounter[socket.handshake.auth['fileID']] == "undefined") roomCounter[socket.handshake.auth['fileID']] = 0;
        socket.join("d:" + socket.handshake.auth['fileID']);
        roomCounter[socket.handshake.auth['fileID']]++;
        console.log(roomCounter);
        socket.writeAccess = write_access;
        next();
    }
  
    // verify the user's credentials
    MysqlConnection.query("SELECT token FROM doc_tokens WHERE uid=?", [socket.handshake.auth['userID']], (err, res) => {
        if(err === null && res[0]['token'] == socket.handshake.auth['token']) {
        console.log("user identified, token ok");
            if(socket.handshake.auth['fileType'] == 'chapter') {
                MysqlConnection.query("SELECT owner FROM courses WHERE courses.id=(SELECT course FROM chapters WHERE chapters.id=?);", [socket.handshake.auth['fileID']], (err, res) => {
                    if(res[0]['owner'] == socket.handshake.auth['userID']) init(true);
                });
            } else {
                MysqlConnection.query("SELECT owner, private FROM documents WHERE id=?", [socket.handshake.auth['fileID']], (err, res) => {
                    if(err === null && res.length > 0 && res[0]['owner'] == socket.handshake.auth['userID']) init(true);
                    else {
                        // Check if document was shared with the user
                        MysqlConnection.query("SELECT * FROM document_permissions WHERE doc_id=? AND user=?", [socket.handshake.auth['fileID'], socket.handshake.auth['userID']], (err, permissions) => {
                            console.log("User permissions: ", permissions);
                            if(err === null && permissions.length > 0) {
                                if(permissions[0]['write_access']) init(true);
                                else init();
                            } else if(err === null && res.length > 0 && !res[0]['private']) init();
                            else socket.disconnect();
                        });
                    }
                });
            }
        } else {
            // User credentials not valid
            socket.disconnect();
        }
    });
  
  });
  
  httpsServer.listen(443);

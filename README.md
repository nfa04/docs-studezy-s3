# StudEzy Docserver

## About
This is the repository for StudEzy's Docserver, based on Node.js. Before you continue, you should make sure you have read and understand the main installation instructions: https://github.com/nfa04/studezy-studyplatform/blob/main/README.md

## Installation
### Prerequisites
Please have a look here: https://github.com/nfa04/studezy-studyplatform/blob/main/README.md#Prerequisites

Additionally, this service only works with encrypted connections for security reasons, so you will need to have a valid TLS-certificate (or a self-signed one if you do not plan on releasing your instance to the public).

### Setting up the Docserver
To install this component, download the docker image provided in the release section of this repository. Make sure your selected release version matches your other components and verify your download using the provided checksums!

Make sure your Apache Cassandra and MySQL databases are ready.

You can then go ahead and start the container. Make sure you attach a docker volume to it! Most likely it won't run properly. This is because you need to supply credentials for your other components in order for the service to run correctly.

There are two main things you need to provide:
- The TLS-certificate (and the private key, obviously))
- The .server-vars.json file which contains all other configuration

#### TLS
Please go ahead and copy your TLS-certificate to your container using the docker cp command. The location in which the Chatserver will look for it is: /var/keys/

Your files need to have the following filenames:
- cert.pem: The certificate
- priv.pem: The private key

#### .server-vars.json
You can find an example configuration file here: https://github.com/nfa04/docs-studezy-s3/blob/main/.server-vars.json

Fill it with your credentials and then copy it to /var/ inside your container

#### Checking your installation
You can now proceed to check your installation. However you might need to restart the container first. Open your running main component, navigate to "Documents" and try creating a new document. Type something and then reload. If it works, you're good to go!

## Contact
For any issues related to this software please contact: [info@studezy.com](mailto:info@studezy.com)
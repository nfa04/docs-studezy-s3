FROM node

RUN apt update && apt upgrade -y

COPY src /var/www/

WORKDIR /var/www/

RUN npm install && npm install pm2 -g

RUN mkdir /var/keys/

CMD ["pm2-runtime", "/var/www/index.js"]

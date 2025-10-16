# Slonig - Frontend

Frontend of the Slonig App. Slonig is an open-source, free-to-use web platform that helps teachers encourage more student interaction during lessons. You can find more information about the project and a list of other components of the app at https://github.com/slonigiraf/slonig

## Development

Contributions are welcome!

To start off, this repo uses yarn workspaces to organize the code. As such, after cloning dependencies _should_ be installed via `yarn`, not via npm, the latter will result in broken dependencies.

To get started -

1. Clone the repo locally, via `git clone https://github.com/slonigiraf/slonig.git <optional local path>`
2. Ensure that you have a recent LTS version of Node.js, for development purposes [Node >= 16](https://nodejs.org/en/) is recommended.
3. Ensure that you have a recent version of Yarn, for development purposes [Yarn >= 1.22](https://yarnpkg.com/docs/install) is required.
4. Install the dependencies by running `yarn`
5. Ensure that the [Backend](https://github.com/slonigiraf/slonig-node-dev), IPFS, PeerJS, Coturn, and [Auxiliary services](https://github.com/slonigiraf/economy.slonig.org) are running.
6. Specify system variables
```
export IPFS_SERVER=ipfs.some.org
export PEERJS_SERVER=peerjs.some.org
export COTURN_SERVER=coturn.some.org:3478
export COTURN_USER=some
export COTURN_PASSWORD=some
export AIRDROP_AUTH_TOKEN=some
```
6. Ready! Now you can launch the UI, via `yarn run start`
7. Access the UI via [http://localhost:3000](http://localhost:3000)


## Docker

Build a docker container

```
export $(cat .env | xargs) && \
docker build -t app-slonig-org -f docker/Dockerfile \
  --build-arg IPFS_SERVER=$IPFS_SERVER \
  --build-arg PEERJS_SERVER=$PEERJS_SERVER \
  --build-arg COTURN_SERVER=$COTURN_SERVER \
  --build-arg COTURN_USER=$COTURN_USER \
  --build-arg COTURN_PASSWORD=$COTURN_PASSWORD \
  --build-arg AIRDROP_AUTH_TOKEN=$AIRDROP_AUTH_TOKEN \
  .
```

Example docker-compose.yml
```
services:
  app-some-org:
    image: app-some-org
    container_name: app-some-org
    restart: unless-stopped
    environment:
      - WS_URL=wss://ws-parachain-1.slonigiraf.org
      - VIRTUAL_HOST=app.some.org  
      - VIRTUAL_PORT=80
      - LETSENCRYPT_HOST=app.some.org
      - LETSENCRYPT_EMAIL=some@gmail.com
    expose:
      - 80

networks:
  default:
    name: nginx-proxy
    external: true
```
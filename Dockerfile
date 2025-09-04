FROM node:18-slim

# Install tools including jq
RUN apt-get update && apt-get install -y curl git bash jq && rm -rf /var/lib/apt/lists/*

# Install kubectl (pinned version)
ENV KUBECTL_VERSION=v1.31.0
RUN curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm -f kubectl


WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]

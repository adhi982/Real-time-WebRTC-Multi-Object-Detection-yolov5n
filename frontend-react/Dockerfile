FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Build the React application
RUN npm run build

# Expose ports for HTTP and HTTPS
EXPOSE 3000 3443

# Command to run the integrated server
CMD ["node", "server.js"]

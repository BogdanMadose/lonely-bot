# Install node
FROM node:latest

# Copy sorce code
COPY . .

# Install dependencies
RUN npm install

# Start application
CMD node index.js

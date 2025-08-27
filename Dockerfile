# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy the rest of the project files
COPY . .

# Expose the Minecraft server port (edit if needed)
EXPOSE 55916

# Start the bot
CMD ["node", "main.js"]

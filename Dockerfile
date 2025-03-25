# Use the official Node.js 18 Alpine image
FROM node:18-alpine

# Install necessary dependencies for Puppeteer, Chromium, Xvfb, and DBus
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dbus \
    xvfb \
    bash

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the DISPLAY environment variable for Xvfb
ENV DISPLAY=:99

# Create the DBus system socket directory and generate a machine ID
RUN mkdir -p /var/run/dbus && \
    dbus-uuidgen > /var/lib/dbus/machine-id

# Expose the port the app runs on
EXPOSE 3000

# Command to start DBus, Xvfb, and run the application
CMD ["sh", "-c", "rm -f /var/run/dbus/pid && dbus-daemon --system && Xvfb :99 -screen 0 1024x768x24 & node server.js"]
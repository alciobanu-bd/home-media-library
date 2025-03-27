# Home Media Library/Browser

A simple web application to browse and view your personal media collection (images and videos) using Node.js and Fastify.

## Features

- Browse image and video files
- Filter by media type
- Image and video viewing
- Responsive design
- Pagination for large collections
- Manual refresh of the media library

## Supported Media Types

### Images
- JPG/JPEG
- PNG
- GIF
- WebP
- SVG
- BMP

### Videos
- MP4
- WebM
- OGG
- MOV
- AVI
- MKV

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Create a `.env` file (optional) to customize settings

## Configuration

You can configure the application using environment variables:

- `PORT`: The HTTP server port (default: 3000)
- `MEDIA_PATH`: Absolute path to your media directory (default: ./media)

## Usage

1. Start the server:

```bash
npm start
```

2. For development with auto-reload:

```bash
npm run dev
```

3. Open your browser and navigate to http://localhost:3000

## Project Structure

- `/public`: Frontend assets
  - `/css`: Stylesheets
  - `/js`: Client-side JavaScript
  - `/img`: Static images
- `/src`: Server code
  - `/routes`: API routes
  - `/services`: Business logic

## License

MIT

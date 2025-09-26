# PDF Viewer with Electron

A modern PDF viewer built with Electron that supports live updates and customizable color schemes.

## Features

- **PDF Viewing**: High-quality PDF rendering using PDF.js
- **Live Updates**: Automatically reloads PDF when the file changes
- **Color Schemes**: Multiple built-in themes (Light, Dark, Sepia) and custom color picker
- **Navigation**: Page navigation with keyboard shortcuts
- **Zoom Controls**: Zoom in/out with mouse wheel or keyboard shortcuts
- **Modern UI**: Clean, responsive interface with dark/light themes

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Running the Application

```bash
npm start
```

For development with DevTools:
```bash
npm run dev
```

### Keyboard Shortcuts

- `Ctrl/Cmd + O`: Open PDF file
- `Ctrl/Cmd + R`: Reload current PDF
- `Ctrl/Cmd + +`: Zoom in
- `Ctrl/Cmd + -`: Zoom out
- `Ctrl/Cmd + 0`: Reset zoom
- `←/→`: Navigate pages
- `Home`: Go to first page
- `End`: Go to last page

### Color Schemes

1. **Built-in Themes**: Use the theme selector in the toolbar
   - Light: Standard white background with black text
   - Dark: Dark background with light text
   - Sepia: Warm sepia tones

2. **Custom Colors**: 
   - Select "Custom" from the theme dropdown
   - Click the color picker button (🎨)
   - Choose custom foreground and background colors
   - Apply changes to see the PDF with your custom colors

### Live Updates

The application automatically watches the currently open PDF file for changes. When the file is modified, it will automatically reload the PDF without requiring manual intervention.

## Technical Details

- **Electron**: Cross-platform desktop app framework
- **PDF.js**: Mozilla's PDF rendering library
- **Chokidar**: File system watching for live updates
- **Modern CSS**: Responsive design with CSS Grid and Flexbox

## File Structure

```
pdf_viewer/
├── main.js          # Electron main process
├── index.html       # Main UI
├── styles.css       # Styling and themes
├── renderer.js      # PDF viewer logic
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## Building for Distribution

To build the application for distribution:

```bash
npm run build
```

This will create distributable packages in the `dist` folder.

## Requirements

- Node.js 14 or higher
- npm or yarn package manager

## License

MIT License - feel free to use and modify as needed.

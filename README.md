# Evolutionary Grid Simulation 🧬

A web-based evolutionary grid simulation using HTML5 Canvas and JavaScript. Visualize populations evolving across a grid environment.

## Features

- 🎨 Interactive grid visualization
- 🧬 Population evolution mechanics
- 📊 Real-time rendering with canvas
- 🖱️ Clean, responsive UI design

## Files

- `index.html` - Main HTML structure and Canvas setup
- `script.js` - Evolutionary logic and simulation engine
- `style.css` - Styling for the grid visualization

## How to Run

### Option 1: Python HTTP Server (Recommended)

```bash
cd /Users/nirari/Projects/gems/evolutionary-grid-sim
python3 -m http.server 8000
```

Then open your browser and navigate to:
`http://localhost:8000`

### Option 2: Node.js HTTP Server

```bash
npm install -g serve
serve -l 8000
```

Or use any other local development server of your choice.

## Quick Start

1. Open a terminal in the project directory
2. Start the local server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your web browser
4. Enjoy watching the evolution!

## Technology Stack

- **HTML5** - Canvas API for rendering
- **JavaScript (ES6+)** - Simulation logic and interaction handling
- **CSS3** - Responsive styling and animations
- **Python SimpleHTTPServer** / Node.js - Local development server

## Development

To add new features or modify existing ones:

1. Edit the relevant files (`index.html`, `script.js`, or `style.css`)
2. Test locally using the Python server
3. Commit and push changes

```bash
git add .
git commit -m "Description of your changes"
git push
```

## License

This project is for educational and experimentation purposes.

---

*Built with ❤️ using the power of evolutionary algorithms*

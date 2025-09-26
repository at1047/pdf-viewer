const { ipcRenderer } = require('electron');
const pdfjsLib = require('pdfjs-dist');

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.rendering = false;
        this.currentPdfPath = null;
        
        // High-DPI scaling - keep it simple
        this.devicePixelRatio = window.devicePixelRatio || 1;
        
        // Color scheme settings
        this.colorScheme = {
            foreground: '#000000',
            background: '#ffffff'
        };
        
        this.initializeElements();
        this.bindEvents();
        this.setupIPC();
    }
    
    initializeElements() {
        // Main elements
        this.welcomeScreen = document.getElementById('welcome');
        this.pdfContainer = document.getElementById('pdfContainer');
        this.pdfCanvas = document.getElementById('pdfCanvas');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        
        // Welcome screen controls
        this.welcomeOpenBtn = document.getElementById('welcomeOpenBtn');
        
        // Color picker modal
        this.colorPickerModal = document.getElementById('colorPickerModal');
        this.closeColorPicker = document.getElementById('closeColorPicker');
        this.foregroundColor = document.getElementById('foregroundColor');
        this.backgroundColor = document.getElementById('backgroundColor');
        this.foregroundHex = document.getElementById('foregroundHex');
        this.backgroundHex = document.getElementById('backgroundHex');
        this.applyColors = document.getElementById('applyColors');
        this.resetColors = document.getElementById('resetColors');
    }
    
    bindEvents() {
        // File operations
        this.welcomeOpenBtn.addEventListener('click', () => this.openFile());
        
        // Color picker modal
        this.closeColorPicker.addEventListener('click', () => this.closeColorPickerModal());
        this.applyColors.addEventListener('click', () => this.applyCustomColors());
        this.resetColors.addEventListener('click', () => this.resetCustomColors());
        
        // Color input synchronization
        this.foregroundColor.addEventListener('input', (e) => {
            this.foregroundHex.value = e.target.value;
        });
        this.backgroundColor.addEventListener('input', (e) => {
            this.backgroundHex.value = e.target.value;
        });
        this.foregroundHex.addEventListener('input', (e) => {
            if (this.isValidHex(e.target.value)) {
                this.foregroundColor.value = e.target.value;
            }
        });
        this.backgroundHex.addEventListener('input', (e) => {
            if (this.isValidHex(e.target.value)) {
                this.backgroundColor.value = e.target.value;
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'o':
                        e.preventDefault();
                        this.openFile();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.reloadCurrentPdf();
                        break;
                    case '=':
                    case '+':
                        e.preventDefault();
                        this.zoomIn();
                        break;
                    case '-':
                        e.preventDefault();
                        this.zoomOut();
                        break;
                    case '0':
                        e.preventDefault();
                        this.resetZoom();
                        break;
                }
            } else {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.previousPage();
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.nextPage();
                        break;
                    case 'Home':
                        e.preventDefault();
                        this.goToPage(1);
                        break;
                    case 'End':
                        e.preventDefault();
                        this.goToPage(this.totalPages);
                        break;
                }
            }
        });
        
        // Close modal on outside click
        this.colorPickerModal.addEventListener('click', (e) => {
            if (e.target === this.colorPickerModal) {
                this.closeColorPickerModal();
            }
        });
        
        // Mouse wheel zoom
        this.pdfCanvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                this.setZoom(this.scale + delta);
            }
        });
    }
    
    setupIPC() {
        // Listen for PDF file changes from main process
        ipcRenderer.on('load-pdf', (event, filePath) => {
            this.loadPdf(filePath);
        });
        
        ipcRenderer.on('pdf-file-changed', (event, filePath) => {
            console.log('PDF file changed, reloading...');
            this.loadPdf(filePath);
        });
        
        // Listen for zoom commands from main process
        ipcRenderer.on('zoom-in', () => this.zoomIn());
        ipcRenderer.on('zoom-out', () => this.zoomOut());
        ipcRenderer.on('reset-zoom', () => this.resetZoom());
        
        // Listen for theme commands from main process
        ipcRenderer.on('set-theme', (event, theme) => {
            this.setTheme(theme);
        });
        
        ipcRenderer.on('open-color-picker', () => {
            this.openColorPicker();
        });
    }
    
    async openFile() {
        try {
            const result = await ipcRenderer.invoke('show-open-dialog');
            if (!result.canceled && result.filePaths.length > 0) {
                this.loadPdf(result.filePaths[0]);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }
    
    async loadPdf(filePath) {
        try {
            this.showLoading();
            this.currentPdfPath = filePath;
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument(filePath);
            this.pdfDoc = await loadingTask.promise;
            
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            
            await this.renderPage();
            this.showPdfViewer();
            this.updateControls();
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError('Failed to load PDF file');
        } finally {
            this.hideLoading();
        }
    }
    
    async renderPage() {
        if (!this.pdfDoc || this.rendering) return;
        
        this.rendering = true;
        
        try {
            const page = await this.pdfDoc.getPage(this.currentPage);
            
            // Use device pixel ratio for crisp rendering
            const actualScale = this.scale * this.devicePixelRatio;
            const viewport = page.getViewport({ scale: actualScale });
            
            // Set canvas dimensions for high-DPI
            this.pdfCanvas.width = viewport.width;
            this.pdfCanvas.height = viewport.height;
            
            // Set display size (CSS pixels)
            this.pdfCanvas.style.width = (viewport.width / this.devicePixelRatio) + 'px';
            this.pdfCanvas.style.height = (viewport.height / this.devicePixelRatio) + 'px';
            
            const context = this.pdfCanvas.getContext('2d');
            
            // Enable high-quality rendering
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            
            // Scale context for high-DPI
            context.scale(this.devicePixelRatio, this.devicePixelRatio);
            
            // Apply custom colors
            context.fillStyle = this.colorScheme.background;
            context.fillRect(0, 0, viewport.width / this.devicePixelRatio, viewport.height / this.devicePixelRatio);
            
            const renderContext = {
                canvasContext: context,
                viewport: page.getViewport({ scale: this.scale }),
                intent: 'display'
            };
            
            await page.render(renderContext).promise;
            
            // Always apply color overlay for theme-based styling
            this.applyColorOverlay();
            
        } catch (error) {
            console.error('Error rendering page:', error);
        } finally {
            this.rendering = false;
        }
    }
    
    applyColorOverlay() {
        const canvas = this.pdfCanvas;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Convert hex colors to RGB
        const fgColor = this.hexToRgb(this.colorScheme.foreground);
        const bgColor = this.hexToRgb(this.colorScheme.background);
        
        // Get current theme for special handling
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a > 0) {
                const brightness = (r + g + b) / 3;
                const isDarkTheme = currentTheme === 'dark';
                
                if (isDarkTheme) {
                    // For dark theme, invert the logic and apply more sophisticated color mapping
                    if (brightness < 200) {
                        // Darker pixels (likely text) - apply foreground color
                        data[i] = fgColor.r;
                        data[i + 1] = fgColor.g;
                        data[i + 2] = fgColor.b;
                    } else {
                        // Lighter pixels (likely background) - apply background color
                        data[i] = bgColor.r;
                        data[i + 1] = bgColor.g;
                        data[i + 2] = bgColor.b;
                    }
                } else {
                    // For light and sepia themes, use standard logic
                    if (brightness < 128) {
                        // Text pixel - apply foreground color
                        data[i] = fgColor.r;
                        data[i + 1] = fgColor.g;
                        data[i + 2] = fgColor.b;
                    } else {
                        // Background pixel - apply background color
                        data[i] = bgColor.r;
                        data[i + 1] = bgColor.g;
                        data[i + 2] = bgColor.b;
                    }
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    isValidHex(hex) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
    }
    
    zoomIn() {
        this.scale = Math.min(this.scale * 1.2, 5.0);
        this.renderPage();
        this.updateZoomDisplay();
    }
    
    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.1);
        this.renderPage();
        this.updateZoomDisplay();
    }
    
    resetZoom() {
        this.scale = 1.0;
        this.renderPage();
        this.updateZoomDisplay();
    }
    
    setZoom(zoomLevel) {
        this.scale = Math.max(0.1, Math.min(5.0, zoomLevel));
        this.renderPage();
        this.updateZoomDisplay();
    }
    
    async previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    async nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    async goToPage(pageNumber) {
        if (pageNumber >= 1 && pageNumber <= this.totalPages) {
            this.currentPage = pageNumber;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    updateControls() {
        // Controls are now handled by menu bar, no need to update UI elements
        console.log(`Page ${this.currentPage} of ${this.totalPages}`);
    }
    
    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        
        if (theme === 'custom') {
            this.openColorPicker();
        } else {
            // Set theme-specific colors for PDF styling
            switch(theme) {
                case 'light':
                    this.colorScheme = {
                        foreground: '#000000',
                        background: '#ffffff'
                    };
                    break;
                case 'dark':
                    this.colorScheme = {
                        foreground: '#ffffff',
                        background: '#1a1a1a'
                    };
                    break;
                case 'sepia':
                    this.colorScheme = {
                        foreground: '#5c4b37',
                        background: '#f4f1e8'
                    };
                    break;
                default:
                    this.colorScheme = {
                        foreground: '#000000',
                        background: '#ffffff'
                    };
            }
            
            if (this.pdfDoc) {
                this.renderPage();
            }
        }
    }
    
    openColorPicker() {
        this.colorPickerModal.style.display = 'flex';
        this.foregroundColor.value = this.colorScheme.foreground;
        this.backgroundColor.value = this.colorScheme.background;
        this.foregroundHex.value = this.colorScheme.foreground;
        this.backgroundHex.value = this.colorScheme.background;
    }
    
    closeColorPickerModal() {
        this.colorPickerModal.style.display = 'none';
    }
    
    applyCustomColors() {
        this.colorScheme.foreground = this.foregroundColor.value;
        this.colorScheme.background = this.backgroundColor.value;
        
        if (this.pdfDoc) {
            this.renderPage();
        }
        
        this.closeColorPickerModal();
    }
    
    resetCustomColors() {
        this.colorScheme.foreground = '#000000';
        this.colorScheme.background = '#ffffff';
        
        this.foregroundColor.value = this.colorScheme.foreground;
        this.backgroundColor.value = this.colorScheme.background;
        this.foregroundHex.value = this.colorScheme.foreground;
        this.backgroundHex.value = this.colorScheme.background;
        
        if (this.pdfDoc) {
            this.renderPage();
        }
    }
    
    reloadCurrentPdf() {
        if (this.currentPdfPath) {
            this.loadPdf(this.currentPdfPath);
        }
    }
    
    showPdfViewer() {
        this.welcomeScreen.style.display = 'none';
        this.pdfContainer.style.display = 'flex';
    }
    
    showLoading() {
        this.loadingIndicator.style.display = 'block';
    }
    
    hideLoading() {
        this.loadingIndicator.style.display = 'none';
    }
    
    showError(message) {
        console.error(message);
        // You could implement a proper error display here
    }
}

// Initialize the PDF viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PDFViewer();
});
const { ipcRenderer } = require('electron');
const pdfjsLib = require('pdfjs-dist');

// Configure PDF.js worker for Mozilla PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.js');

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.rendering = false;
        this.currentPdfPath = null;
        this.enableColorOverlay = false;
        this.activeTheme = 'light';
        this.maxDevicePixelRatio = 3; // cap to control memory/CPU
        this.retinaBoostFactor = 1.5; // extra oversampling when zoomed out
        
        // High-DPI scaling - keep it simple
        this.devicePixelRatio = window.devicePixelRatio || 1;
        
        // Color scheme settings
        this.colorScheme = {
            foreground: '#000000',
            background: '#ffffff'
        };
        
        console.log('PDFViewer constructor - initializing...');
        this.initializeElements();
        this.bindEvents();
        this.setupIPC();
        this.configureHighQualityRendering();
        console.log('PDFViewer constructor - initialization complete');
    }
    
    initializeElements() {
        console.log('initializeElements() called');
        // Main elements
        this.welcomeScreen = document.getElementById('welcome');
        this.pdfContainer = document.getElementById('pdfContainer');
        this.pdfCanvas = document.getElementById('pdfCanvas');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        
        console.log('Main elements found:', {
            welcomeScreen: !!this.welcomeScreen,
            pdfContainer: !!this.pdfContainer,
            pdfCanvas: !!this.pdfCanvas,
            loadingIndicator: !!this.loadingIndicator
        });
        
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
        
        console.log('initializeElements() complete');
    }
    
    configureHighQualityRendering() {
        // Configure canvas for high-quality vector rendering
        if (this.pdfCanvas) {
            // Set canvas attributes for maximum quality
            this.pdfCanvas.style.imageRendering = 'high-quality';
            this.pdfCanvas.style.imageRendering = 'crisp-edges';
            
            // Force hardware acceleration
            this.pdfCanvas.style.transform = 'translateZ(0)';
            this.pdfCanvas.style.willChange = 'transform';
            this.pdfCanvas.style.backfaceVisibility = 'hidden';
            
            // Ensure crisp text rendering
            this.pdfCanvas.style.textRendering = 'optimizeLegibility';
            this.pdfCanvas.style.fontSmooth = 'always';
            this.pdfCanvas.style.webkitFontSmoothing = 'antialiased';
            this.pdfCanvas.style.mozOsxFontSmoothing = 'grayscale';
        }
    }
    
    bindEvents() {
        console.log('bindEvents() called');
        // File operations
        console.log('Adding click listener to welcomeOpenBtn:', !!this.welcomeOpenBtn);
        this.welcomeOpenBtn.addEventListener('click', () => {
            console.log('Welcome open button clicked');
            this.openFile();
        });
        
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
            console.log('openFile() called - requesting file dialog');
            const result = await ipcRenderer.invoke('show-open-dialog');
            console.log('File dialog result:', result);
            if (!result.canceled && result.filePaths.length > 0) {
                console.log('File selected:', result.filePaths[0]);
                this.loadPdf(result.filePaths[0]);
            } else {
                console.log('No file selected or dialog canceled');
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }
    
    async loadPdf(filePath) {
        try {
            console.log('Loading PDF:', filePath);
            this.showLoading();
            this.currentPdfPath = filePath;
            
            // Load PDF document using Mozilla PDF.js
            const loadingTask = pdfjsLib.getDocument({
                url: filePath
            });
            
            this.pdfDoc = await loadingTask.promise;
            console.log('PDF loaded successfully, pages:', this.pdfDoc.numPages);
            
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            
            await this.renderPage();
            console.log('Page rendered');
            this.showPdfViewer();
            this.updateControls();

            // After first render, fit to screen height
            this.fitHeight();
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError('Failed to load PDF file');
        } finally {
            this.hideLoading();
        }
    }
    
    async renderPage() {
        if (!this.pdfDoc || this.rendering) return;
        
        console.log('Starting renderPage, currentPage:', this.currentPage);
        this.rendering = true;
        
        try {
            const page = await this.pdfDoc.getPage(this.currentPage);
            console.log('Page loaded, rendering...');
            
            // Compute HiDPI render settings to keep text crisp on Retina
            const pixelRatio = this.getAdaptivePixelRatio();
            const displayViewport = page.getViewport({ scale: this.scale });
            console.log('Display viewport:', displayViewport.width, 'x', displayViewport.height, 'px, DPR:', pixelRatio);
            
            // Canvas backing store size (device pixels)
            const deviceWidth = Math.round(displayViewport.width * pixelRatio);
            const deviceHeight = Math.round(displayViewport.height * pixelRatio);

            // Apply sizes. CSS size stays in CSS pixels; backing store is multiplied by DPR
            this.pdfCanvas.width = deviceWidth;
            this.pdfCanvas.height = deviceHeight;
            this.pdfCanvas.style.width = Math.round(displayViewport.width) + 'px';
            this.pdfCanvas.style.height = Math.round(displayViewport.height) + 'px';
            
            const context = this.pdfCanvas.getContext('2d');
            
            // Disable image smoothing to keep text crisp at native scale
            context.imageSmoothingEnabled = false;
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            
            // Apply background behind page (in CSS pixel coords; context already scaled)
            context.fillStyle = this.colorScheme.background;
            context.fillRect(0, 0, Math.round(displayViewport.width), Math.round(displayViewport.height));
            
            const renderContext = {
                canvasContext: context,
                viewport: displayViewport,
                intent: 'display'
            };
            
            await page.render(renderContext).promise;
            console.log('Page render completed');
            
            // Optionally apply color overlay if enabled (may reduce sharpness)
            if (this.enableColorOverlay) {
                this.applyColorOverlay();
            }

            // Always (re)apply CSS filter for the current theme after rendering
            this.applyThemeFilter();
            
        } catch (error) {
            console.error('Error rendering page:', error);
        } finally {
            this.rendering = false;
        }
    }

    getAdaptivePixelRatio() {
        const dpr = window.devicePixelRatio || 1;
        const boosted = this.scale < 1 ? Math.min(this.maxDevicePixelRatio, dpr * this.retinaBoostFactor) : dpr;
        return Math.max(1, Math.min(this.maxDevicePixelRatio, boosted));
    }
    
    applyColorOverlay() {
        console.log('applyColorOverlay() called');
        const canvas = this.pdfCanvas;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        console.log('Image data retrieved, applying color overlay...');
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

    // Fit the page width to a fraction of the current window width
    async fitWidthFraction(fraction) {
        try {
            if (!this.pdfDoc) return; // wait until a PDF is loaded
            const page = await this.pdfDoc.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: 1 });
            const containerWidth = Math.max(1, window.innerWidth * (fraction || 0.5));
            const newScale = containerWidth / viewport.width;
            this.setZoom(newScale);
        } catch (e) {
            console.warn('fitWidthFraction failed (no PDF yet). It will apply after first load.');
        }
    }

    // Fit the page height to the current window height
    async fitHeight() {
        try {
            if (!this.pdfDoc) return;
            const page = await this.pdfDoc.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: 1 });
            const containerHeight = Math.max(1, window.innerHeight);
            const newScale = containerHeight / viewport.height;
            this.setZoom(newScale);
        } catch (e) {
            console.warn('fitHeight failed (no PDF yet). It will apply after first load.');
        }
    }
    
    updateControls() {
        // Controls are now handled by menu bar, no need to update UI elements
        console.log(`Page ${this.currentPage} of ${this.totalPages}`);
    }
    
    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        this.activeTheme = theme;
        
        if (theme === 'custom') {
            this.enableColorOverlay = true;
            this.openColorPicker();
        } else {
            this.enableColorOverlay = false;
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

        // Apply CSS filter immediately for theme
        this.applyThemeFilter();
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
        this.enableColorOverlay = true;
        
        if (this.pdfDoc) {
            this.renderPage();
        }
        
        this.closeColorPickerModal();
    }
    
    resetCustomColors() {
        this.colorScheme.foreground = '#000000';
        this.colorScheme.background = '#ffffff';
        this.enableColorOverlay = false;
        
        this.foregroundColor.value = this.colorScheme.foreground;
        this.backgroundColor.value = this.colorScheme.background;
        this.foregroundHex.value = this.colorScheme.foreground;
        this.backgroundHex.value = this.colorScheme.background;
        
        if (this.pdfDoc) {
            this.renderPage();
        }
    }

    applyThemeFilter() {
        if (!this.pdfCanvas) return;
        // Clear any existing filters by default
        let filter = 'none';
        switch (this.activeTheme) {
            case 'dark':
                // Invert + hue rotate is a common trick to approximate dark mode
                // Fine-tuned for readability with slight contrast/brightness adjustments
                filter = 'invert(1) hue-rotate(180deg) contrast(0.95) brightness(0.9)';
                break;
            case 'sepia':
                filter = 'sepia(1) saturate(0.7) brightness(1.05)';
                break;
            case 'custom':
                // Custom uses pixel overlay instead of CSS filter
                filter = 'none';
                break;
            case 'light':
            default:
                filter = 'none';
        }
        this.pdfCanvas.style.filter = filter;
    }
    
    reloadCurrentPdf() {
        if (this.currentPdfPath) {
            this.loadPdf(this.currentPdfPath);
        }
    }
    
    showPdfViewer() {
        console.log('showPdfViewer() called - showing PDF container');
        this.welcomeScreen.style.display = 'none';
        this.pdfContainer.style.display = 'flex';
        console.log('PDF container display set to flex');
    }
    
    showLoading() {
        this.loadingIndicator.style.display = 'block';
    }
    
    hideLoading() {
        console.log('hideLoading() called - hiding loading indicator');
        this.loadingIndicator.style.display = 'none';
    }
    
    showError(message) {
        console.error(message);
        // You could implement a proper error display here
    }
}

// Initialize the PDF viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - initializing PDFViewer');
    const viewer = new PDFViewer();
    // After first load, we'll fit to screen height
    console.log('PDFViewer instance created');
});
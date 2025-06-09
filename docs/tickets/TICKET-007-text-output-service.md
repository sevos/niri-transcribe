# TICKET-007: Text Output Service (Wayland Integration)

## Blockers
- TICKET-001: Docker Infrastructure Setup (need wtype access)

## Priority
High

## Description
Implement the text output service that injects transcribed text into the focused Wayland window using wtype with smart typing simulation.

## Acceptance Criteria
- [ ] wtype integration for text injection
- [ ] Smart typing delay simulation
- [ ] Unicode and special character support
- [ ] Focus window detection
- [ ] Error handling for typing failures
- [ ] Typing speed configuration

## Technical Requirements

### Text Output Service
```javascript
// src/services/text-output.js
const { spawn } = require('child_process');
const EventEmitter = require('events');

class TextOutputService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config.output;
    this.isTyping = false;
    this.typeQueue = [];
    this.processing = false;
  }

  async initialize() {
    // Verify wtype is available
    await this.verifyWtype();
    
    // Start processing queue
    this.processQueue();
  }

  async verifyWtype() {
    try {
      await this.execCommand('wtype', ['--version']);
    } catch (error) {
      throw new Error('wtype not found. Required for Wayland text input.');
    }
  }

  async typeText(text, options = {}) {
    if (!text || text.trim() === '') {
      return;
    }

    return new Promise((resolve, reject) => {
      this.typeQueue.push({
        text: text.trim(),
        options: { ...this.config, ...options },
        resolve,
        reject,
        timestamp: Date.now()
      });
    });
  }

  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.typeQueue.length > 0) {
      const item = this.typeQueue.shift();
      
      try {
        await this.processTypeRequest(item);
        item.resolve();
      } catch (error) {
        item.reject(error);
      }
    }

    this.processing = false;
    
    // Schedule next processing
    setTimeout(() => this.processQueue(), 100);
  }

  async processTypeRequest({ text, options }) {
    this.isTyping = true;
    this.emit('typingStart', { text });

    try {
      // Clean and prepare text
      const cleanText = this.prepareText(text);
      
      if (options.debug) {
        console.log(`Typing: "${cleanText}"`);
      }

      // Type with smart delays
      await this.typeWithDelays(cleanText, options);
      
      this.emit('typingComplete', { text: cleanText });
    } catch (error) {
      this.emit('typingError', { text, error });
      throw error;
    } finally {
      this.isTyping = false;
    }
  }

  prepareText(text) {
    // Remove extra whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Ensure sentence ends with punctuation
    if (cleaned && !/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }
    
    return cleaned;
  }

  async typeWithDelays(text, options) {
    const typeDelay = options.typeDelay || 10;
    const punctuationDelay = options.punctuationDelay || 100;
    
    // Split into characters for smart delays
    const chars = Array.from(text); // Handles Unicode correctly
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      // Type character
      await this.typeCharacter(char);
      
      // Smart delay based on character type
      let delay = typeDelay;
      
      if (this.isPunctuation(char)) {
        delay = punctuationDelay;
      } else if (char === ' ') {
        delay = typeDelay * 2; // Slightly longer for word boundaries
      }
      
      // Add natural variation (±20%)
      delay += (Math.random() - 0.5) * delay * 0.4;
      
      if (delay > 0 && i < chars.length - 1) {
        await this.sleep(delay);
      }
    }
  }

  async typeCharacter(char) {
    try {
      // Handle special characters
      if (char === '\n') {
        await this.execCommand('wtype', ['-k', 'Return']);
      } else if (char === '\t') {
        await this.execCommand('wtype', ['-k', 'Tab']);
      } else if (this.isSpecialKey(char)) {
        await this.typeSpecialKey(char);
      } else {
        // Regular character
        await this.execCommand('wtype', ['-s', '0', char]);
      }
    } catch (error) {
      console.error(`Failed to type character '${char}':`, error.message);
      throw new Error(`Text input failed: ${error.message}`);
    }
  }

  async typeSpecialKey(char) {
    const keyMappings = {
      '\b': 'BackSpace',
      '\x7f': 'Delete',
      '\x1b': 'Escape'
    };

    const key = keyMappings[char];
    if (key) {
      await this.execCommand('wtype', ['-k', key]);
    } else {
      // Fallback to Unicode input
      const codePoint = char.codePointAt(0);
      await this.execCommand('wtype', ['-u', codePoint.toString(16)]);
    }
  }

  isSpecialKey(char) {
    return char === '\b' || char === '\x7f' || char === '\x1b';
  }

  isPunctuation(char) {
    // Common punctuation that should have longer pauses
    return /[.!?,:;]/.test(char);
  }

  async clearText(length) {
    // Send backspace characters to clear text
    for (let i = 0; i < length; i++) {
      await this.execCommand('wtype', ['-k', 'BackSpace']);
      await this.sleep(10);
    }
  }

  async insertText(text) {
    // Faster insertion without delays (for corrections)
    await this.execCommand('wtype', [text]);
  }

  async checkFocusedWindow() {
    try {
      // Get the currently focused window
      const output = await this.execCommand('swaymsg', ['-t', 'get_tree']);
      const tree = JSON.parse(output);
      
      // Find focused node
      const focused = this.findFocusedNode(tree);
      
      return {
        id: focused?.id,
        name: focused?.name,
        app_id: focused?.app_id,
        window_class: focused?.window_properties?.class
      };
    } catch (error) {
      // Fallback: assume a window is focused
      return { id: null, name: 'Unknown' };
    }
  }

  findFocusedNode(node) {
    if (node.focused) {
      return node;
    }
    
    if (node.nodes) {
      for (const child of node.nodes) {
        const result = this.findFocusedNode(child);
        if (result) return result;
      }
    }
    
    if (node.floating_nodes) {
      for (const child of node.floating_nodes) {
        const result = this.findFocusedNode(child);
        if (result) return result;
      }
    }
    
    return null;
  }

  async execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      isTyping: this.isTyping,
      queueLength: this.typeQueue.length,
      processing: this.processing
    };
  }

  async stop() {
    // Clear queue
    this.typeQueue = [];
    
    // Wait for current typing to complete
    while (this.isTyping) {
      await this.sleep(100);
    }
  }
}

module.exports = TextOutputService;
```

### Text Processing Utilities
```javascript
// src/utils/text-processing.js
class TextProcessor {
  static cleanTranscription(text) {
    // Remove common transcription artifacts
    let cleaned = text
      .replace(/\s+/g, ' ')  // Multiple spaces
      .replace(/\.\.\./g, '.') // Multiple dots
      .trim();

    // Capitalize first letter
    if (cleaned) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  static addSmartPunctuation(text) {
    // Add punctuation if missing
    if (!text) return text;
    
    const trimmed = text.trim();
    if (!/[.!?]$/.test(trimmed)) {
      // Determine appropriate punctuation
      if (this.isQuestion(trimmed)) {
        return trimmed + '?';
      } else if (this.isExclamation(trimmed)) {
        return trimmed + '!';
      } else {
        return trimmed + '.';
      }
    }
    
    return trimmed;
  }

  static isQuestion(text) {
    const questionWords = ['what', 'where', 'when', 'why', 'who', 'how', 'which', 'whose'];
    const firstWord = text.toLowerCase().split(' ')[0];
    return questionWords.includes(firstWord) || text.toLowerCase().includes('?');
  }

  static isExclamation(text) {
    const exclamationWords = ['wow', 'amazing', 'incredible', 'awesome', 'fantastic'];
    const lowerText = text.toLowerCase();
    return exclamationWords.some(word => lowerText.includes(word));
  }

  static splitIntoSentences(text) {
    // Simple sentence splitting
    return text.split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  static estimateTypingTime(text, wpm = 60) {
    // Estimate typing time based on WPM
    const words = text.split(' ').length;
    const charactersPerMinute = wpm * 5; // Average word length
    const characters = text.length;
    
    return (characters / charactersPerMinute) * 60 * 1000; // Convert to milliseconds
  }
}

module.exports = TextProcessor;
```

## Implementation Steps
1. Implement wtype integration
2. Create smart typing delay system
3. Add Unicode character support
4. Implement text preparation utilities
5. Add focus window detection
6. Create typing queue management

## Testing Requirements
- Test with various Unicode characters
- Verify typing delays feel natural
- Test error recovery
- Validate focus detection
- Performance testing with long text

## Estimated Time
4 hours

## Dependencies
- wtype (Wayland text input tool)
- swaymsg (for focus detection, fallback)
- Unicode character handling
(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.LoopedWidget) {
    console.warn('Looped Widget is already initialized');
    return;
  }

  // Default configuration
  const DEFAULT_CONFIG = {
    companyId: null,
    primaryColor: '#3B82F6',
    position: 'bottom-right',
    greeting: 'Hello! How can I help you today?',
    placeholder: 'Type your message here...',
    apiUrl: 'https://looped.app/api',
    widgetUrl: 'https://looped.app'
  };

  // Widget state
  let isWidgetLoaded = false;
  let isWidgetOpen = false;
  let widgetContainer = null;
  let widgetIframe = null;
  let config = {};

  // Create the widget container
  function createWidgetContainer() {
    const container = document.createElement('div');
    container.id = 'looped-widget-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Add to body
    document.body.appendChild(container);
    return container;
  }

  // Create the chat button
  function createChatButton() {
    const button = document.createElement('button');
    button.id = 'looped-chat-button';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    
    button.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      background-color: ${config.primaryColor};
      color: white;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
    `;

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.1)';
      button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });

    // Click handler
    button.addEventListener('click', toggleWidget);

    return button;
  }

  // Create the widget iframe
  function createWidgetIframe() {
    const iframe = document.createElement('iframe');
    iframe.id = 'looped-widget-iframe';
    iframe.src = `${config.widgetUrl}/widget?companyId=${encodeURIComponent(config.companyId)}&config=${encodeURIComponent(JSON.stringify(config))}`;
    iframe.style.cssText = `
      width: 400px;
      height: 600px;
      border: none;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      background: white;
      position: absolute;
      bottom: 80px;
      right: 0;
      transform: scale(0.8) translateY(20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
    `;

    // Handle iframe messages
    window.addEventListener('message', handleIframeMessage);

    return iframe;
  }

  // Handle messages from the widget iframe
  function handleIframeMessage(event) {
    // Verify origin for security
    if (event.origin !== config.widgetUrl) {
      return;
    }

    const { type, data } = event.data;

    switch (type) {
      case 'widget-close':
        closeWidget();
        break;
      case 'widget-ready':
        console.log('Looped Widget is ready');
        break;
      case 'widget-resize':
        if (widgetIframe && data.height) {
          widgetIframe.style.height = `${data.height}px`;
        }
        break;
      case 'message-sent':
        // Analytics or custom handling
        if (config.onMessageSent) {
          config.onMessageSent(data);
        }
        break;
    }
  }

  // Toggle widget visibility
  function toggleWidget() {
    if (isWidgetOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  // Open the widget
  function openWidget() {
    if (!widgetIframe) {
      widgetIframe = createWidgetIframe();
      widgetContainer.appendChild(widgetIframe);
    }

    isWidgetOpen = true;
    
    // Animate in
    requestAnimationFrame(() => {
      widgetIframe.style.transform = 'scale(1) translateY(0)';
      widgetIframe.style.opacity = '1';
      widgetIframe.style.pointerEvents = 'auto';
    });

    // Update button
    const button = document.getElementById('looped-chat-button');
    if (button) {
      button.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    }

    // Trigger callback
    if (config.onWidgetOpen) {
      config.onWidgetOpen();
    }
  }

  // Close the widget
  function closeWidget() {
    if (!widgetIframe) return;

    isWidgetOpen = false;

    // Animate out
    widgetIframe.style.transform = 'scale(0.8) translateY(20px)';
    widgetIframe.style.opacity = '0';
    widgetIframe.style.pointerEvents = 'none';

    // Update button
    const button = document.getElementById('looped-chat-button');
    if (button) {
      button.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    }

    // Trigger callback
    if (config.onWidgetClose) {
      config.onWidgetClose();
    }
  }

  // Initialize the widget
  function init(userConfig = {}) {
    // Validate required config
    if (!userConfig.companyId) {
      console.error('Looped Widget: companyId is required');
      return;
    }

    // Merge configuration
    config = { ...DEFAULT_CONFIG, ...userConfig };

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeWidget);
    } else {
      initializeWidget();
    }
  }

  // Initialize the widget DOM elements
  function initializeWidget() {
    if (isWidgetLoaded) {
      console.warn('Looped Widget is already loaded');
      return;
    }

    try {
      // Create container
      widgetContainer = createWidgetContainer();
      
      // Create and add chat button
      const chatButton = createChatButton();
      widgetContainer.appendChild(chatButton);

      isWidgetLoaded = true;
      console.log('Looped Widget initialized successfully');

      // Trigger callback
      if (config.onWidgetLoad) {
        config.onWidgetLoad();
      }

    } catch (error) {
      console.error('Failed to initialize Looped Widget:', error);
    }
  }

  // Public API
  window.LoopedWidget = {
    init: init,
    open: openWidget,
    close: closeWidget,
    toggle: toggleWidget,
    isOpen: () => isWidgetOpen,
    destroy: () => {
      if (widgetContainer) {
        widgetContainer.remove();
        widgetContainer = null;
        widgetIframe = null;
        isWidgetLoaded = false;
        isWidgetOpen = false;
      }
    }
  };

  // Auto-initialize if config is provided via data attributes
  const script = document.currentScript || document.querySelector('script[src*="looped-widget"]');
  if (script) {
    const companyId = script.getAttribute('data-company-id');
    const primaryColor = script.getAttribute('data-primary-color');
    const position = script.getAttribute('data-position');
    
    if (companyId) {
      const autoConfig = { companyId };
      if (primaryColor) autoConfig.primaryColor = primaryColor;
      if (position) autoConfig.position = position;
      
      init(autoConfig);
    }
  }

})();

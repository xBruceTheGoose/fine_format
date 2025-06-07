class NotificationService {
  private hasPermission = false;
  private permissionRequested = false;

  constructor() {
    this.checkPermission();
  }

  private checkPermission(): void {
    if ('Notification' in window) {
      this.hasPermission = Notification.permission === 'granted';
    }
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (this.hasPermission) {
      return true;
    }

    if (this.permissionRequested) {
      return this.hasPermission;
    }

    this.permissionRequested = true;

    try {
      // Show a custom prompt first
      const userWantsNotifications = await this.showNotificationPrompt();
      
      if (!userWantsNotifications) {
        return false;
      }

      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
      
      if (this.hasPermission) {
        // Send a test notification to confirm it's working
        this.sendTestNotification();
      }
      
      return this.hasPermission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  private showNotificationPrompt(): Promise<boolean> {
    return new Promise((resolve) => {
      // Create a custom modal-like prompt
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(10, 10, 10, 0.9);
        backdrop-filter: blur(10px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Source Code Pro', monospace;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: linear-gradient(135deg, rgba(26, 26, 26, 0.95), rgba(26, 26, 26, 0.9));
        border: 2px solid #00FF41;
        border-radius: 12px;
        padding: 32px;
        max-width: 500px;
        margin: 20px;
        box-shadow: 
          0 0 20px rgba(0, 255, 65, 0.3),
          inset 0 0 20px rgba(0, 255, 65, 0.05);
        text-align: center;
      `;

      modal.innerHTML = `
        <div style="color: #00FF41; font-size: 24px; font-weight: bold; margin-bottom: 16px; text-shadow: 0 0 5px #00FF41;">
          🔔 ENABLE NOTIFICATIONS
        </div>
        <div style="color: #00FFFF; font-size: 16px; margin-bottom: 24px; line-height: 1.5;">
          Get notified when your dataset generation is complete!<br>
          <span style="color: #666666; font-size: 14px;">This is a one-time setup for future convenience.</span>
        </div>
        <div style="display: flex; gap: 16px; justify-content: center;">
          <button id="enable-notifications" style="
            background: linear-gradient(45deg, rgba(0, 255, 65, 0.1), rgba(0, 255, 65, 0.15));
            border: 1px solid #00FF41;
            color: #00FF41;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Source Code Pro', monospace;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 0 5px rgba(0, 255, 65, 0.2);
          ">
            ENABLE NOTIFICATIONS
          </button>
          <button id="skip-notifications" style="
            background: rgba(102, 102, 102, 0.1);
            border: 1px solid #666666;
            color: #666666;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Source Code Pro', monospace;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
          ">
            SKIP
          </button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Add hover effects
      const enableBtn = modal.querySelector('#enable-notifications') as HTMLElement;
      const skipBtn = modal.querySelector('#skip-notifications') as HTMLElement;

      enableBtn.addEventListener('mouseenter', () => {
        enableBtn.style.background = 'linear-gradient(45deg, rgba(0, 255, 65, 0.15), rgba(0, 255, 65, 0.2))';
        enableBtn.style.boxShadow = '0 0 10px rgba(0, 255, 65, 0.3)';
        enableBtn.style.transform = 'translateY(-1px)';
      });

      enableBtn.addEventListener('mouseleave', () => {
        enableBtn.style.background = 'linear-gradient(45deg, rgba(0, 255, 65, 0.1), rgba(0, 255, 65, 0.15))';
        enableBtn.style.boxShadow = '0 0 5px rgba(0, 255, 65, 0.2)';
        enableBtn.style.transform = 'translateY(0)';
      });

      skipBtn.addEventListener('mouseenter', () => {
        skipBtn.style.background = 'rgba(102, 102, 102, 0.2)';
        skipBtn.style.borderColor = '#999999';
        skipBtn.style.color = '#999999';
      });

      skipBtn.addEventListener('mouseleave', () => {
        skipBtn.style.background = 'rgba(102, 102, 102, 0.1)';
        skipBtn.style.borderColor = '#666666';
        skipBtn.style.color = '#666666';
      });

      // Handle button clicks
      enableBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(true);
      });

      skipBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });

      // Handle escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  private sendTestNotification(): void {
    if (!this.hasPermission) return;

    new Notification('🚀 Fine Format Notifications Enabled!', {
      body: 'You\'ll be notified when your dataset generation completes.',
      icon: '/favicon.ico',
      tag: 'fine-format-test',
      requireInteraction: false,
    });
  }

  public async sendCompletionNotification(totalPairs: number, correctPairs: number, incorrectPairs: number): Promise<void> {
    if (!this.hasPermission) return;

    try {
      const notification = new Notification('✅ Dataset Generation Complete!', {
        body: `Successfully generated ${totalPairs} Q&A pairs (${correctPairs} correct, ${incorrectPairs} incorrect). Ready for download!`,
        icon: '/favicon.ico',
        tag: 'fine-format-complete',
        requireInteraction: true,
        actions: [
          { action: 'view', title: 'View Results' }
        ]
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds if not interacted with
      setTimeout(() => {
        notification.close();
      }, 10000);

    } catch (error) {
      console.error('Failed to send completion notification:', error);
    }
  }

  public async sendErrorNotification(errorMessage: string): Promise<void> {
    if (!this.hasPermission) return;

    try {
      const notification = new Notification('❌ Dataset Generation Failed', {
        body: `Error: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`,
        icon: '/favicon.ico',
        tag: 'fine-format-error',
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 15 seconds
      setTimeout(() => {
        notification.close();
      }, 15000);

    } catch (error) {
      console.error('Failed to send error notification:', error);
    }
  }

  public isSupported(): boolean {
    return 'Notification' in window;
  }

  public hasNotificationPermission(): boolean {
    return this.hasPermission;
  }
}

export const notificationService = new NotificationService();
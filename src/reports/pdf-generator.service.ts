import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class PdfGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private browserInstance: any = null;
  private browserLaunchPromise: Promise<any> | null = null;

  private async getBrowser() {
    if (this.browserInstance?.connected) {
      return this.browserInstance;
    }

    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    this.browserLaunchPromise = (async () => {
      const puppeteer = await import('puppeteer');
      this.browserInstance = await puppeteer.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.browserInstance.on('disconnected', () => {
        this.browserInstance = null;
        this.browserLaunchPromise = null;
      });

      this.browserLaunchPromise = null;
      return this.browserInstance;
    })();

    return this.browserLaunchPromise;
  }

  async generatePdf(htmlContent: string): Promise<Buffer> {
    const browser = await this.getBrowser();

    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '25mm',
          left: '15mm',
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size:9px;text-align:center;width:100%;color:#94a3b8;font-family:Arial,sans-serif;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
      });

      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('Failed to generate PDF', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
}

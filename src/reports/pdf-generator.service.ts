import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private pdfmake: any = null;

  private async getPdfMake() {
    if (this.pdfmake) return this.pdfmake;

    // pdfmake v0.3 server-side usage
    const pdfmakeModule = await import('pdfmake');
    this.pdfmake = pdfmakeModule.default || pdfmakeModule;

    // Register fonts
    const fontsDir = path.join(
      process.cwd(),
      'node_modules',
      'pdfmake',
      'fonts',
      'Roboto',
    );
    this.pdfmake.fonts = {
      Roboto: {
        normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
      },
    };

    return this.pdfmake;
  }

  async generatePdf(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    try {
      const pdfmake = await this.getPdfMake();
      const pdfDoc = pdfmake.createPdf(docDefinition);
      const buffer = await pdfDoc.getBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error('Failed to generate PDF', error);
      throw error;
    }
  }
}

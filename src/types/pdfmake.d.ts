declare module 'pdfmake' {
  const pdfmake: {
    fonts: Record<string, Record<string, string>>;
    createPdf(docDefinition: import('pdfmake/interfaces').TDocumentDefinitions): {
      getBuffer(): Promise<Uint8Array>;
    };
  };
  export default pdfmake;
}

declare module 'pdfmake/interfaces' {
  export type Margins = number | [number, number] | [number, number, number, number];

  export interface ContentText {
    text: string | Array<ContentText | string>;
    fontSize?: number;
    bold?: boolean;
    italics?: boolean;
    color?: string;
    background?: string;
    alignment?: 'left' | 'center' | 'right' | 'justify';
    margin?: Margins;
    lineHeight?: number;
    letterSpacing?: number;
    style?: string;
    fillColor?: string;
    pageBreak?: 'before' | 'after';
    [key: string]: any;
  }

  export interface ContentColumns {
    columns: Content[];
    columnGap?: number;
    margin?: Margins;
    [key: string]: any;
  }

  export interface ContentStack {
    stack: Content[];
    margin?: Margins;
    [key: string]: any;
  }

  export interface ContentTable {
    table: {
      headerRows?: number;
      widths?: Array<string | number | '*'>;
      body: TableCell[][];
    };
    layout?: any;
    margin?: Margins;
    [key: string]: any;
  }

  export interface ContentCanvas {
    canvas: Array<{
      type: string;
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
      lineWidth?: number;
      lineColor?: string;
      [key: string]: any;
    }>;
    margin?: Margins;
    [key: string]: any;
  }

  export type TableCell = ContentText | ContentStack | string | {
    text?: any;
    fontSize?: number;
    bold?: boolean;
    color?: string;
    fillColor?: string;
    alignment?: string;
    margin?: Margins;
    stack?: Content[];
    background?: string;
    [key: string]: any;
  };

  export type Content = ContentText | ContentColumns | ContentStack | ContentTable | ContentCanvas | string | Content[];

  export interface Style {
    font?: string;
    fontSize?: number;
    bold?: boolean;
    italics?: boolean;
    color?: string;
    alignment?: string;
    margin?: Margins;
    lineHeight?: number;
    [key: string]: any;
  }

  export interface TDocumentDefinitions {
    pageSize?: string;
    pageMargins?: Margins;
    defaultStyle?: Style;
    styles?: Record<string, Style>;
    header?: any;
    footer?: any;
    content: Content | Content[];
    [key: string]: any;
  }
}

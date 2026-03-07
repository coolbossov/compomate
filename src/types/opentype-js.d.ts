declare module 'opentype.js/dist/opentype.module.js' {
  export interface BoundingBox {
    x1: number;
    x2: number;
  }

  export interface Path {
    getBoundingBox(): BoundingBox;
  }

  export interface Font {
    getAdvanceWidth(
      text: string,
      fontSize: number,
      options?: { kerning?: boolean },
    ): number;
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: { kerning?: boolean },
    ): Path;
  }

  const opentype: {
    parse(data: ArrayBuffer): Font;
  };

  export default opentype;
}

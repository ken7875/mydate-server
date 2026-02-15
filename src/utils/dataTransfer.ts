export const toBuffer = (data: Record<string, any> | Array<any>): Buffer => {
  return Buffer.from(JSON.stringify(data));
};

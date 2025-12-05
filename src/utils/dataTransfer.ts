export const toBuffer = (data: Record<string, any> | Array<any>): Buffer => {
  let res: Buffer | null = null;
  if (typeof data === 'object') {
    const objectToString = JSON.stringify(data);
    res = Buffer.from(objectToString);
  } else if (Array.isArray(data)) {
    res = Buffer.from(data);
  } else {
    res = Buffer.from(data);
  }

  return res;
};

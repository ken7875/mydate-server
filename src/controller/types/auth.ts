import { JwtPayload } from 'jsonwebtoken';
export interface DecodedToken extends JwtPayload {
  uuid: string;
  // 添加其他你期望在 token 中的字段
}

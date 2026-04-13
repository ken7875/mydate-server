import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/mysql';

export class MessageImage extends Model {
  declare imageId: string;
  declare userId: string;
  declare originalUrl: string;
  declare thumbnailUrl: string;
  declare blurHash: string;
  declare width: number;
  declare height: number;
  declare fileSize: number;
  declare mimeType: string;
  declare isExpired: boolean;
  declare expireAt: Date;
  declare createdAt: Date;
}

MessageImage.init(
  {
    imageId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    originalUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // 縮圖 URL，用於訊息列表預覽，尺寸較小以加速載入
    thumbnailUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // BlurHash 編碼字串，在原圖載入完成前顯示模糊佔位預覽
    blurHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isExpired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    expireAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'message_image',
    timestamps: false,
  },
);

export default MessageImage;

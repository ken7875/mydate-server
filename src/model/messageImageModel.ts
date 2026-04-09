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
    thumbnailUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
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

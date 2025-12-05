import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/mysql';

export class Message extends Model {
  declare senderId: string;
  declare receiverId: string;
  declare message: string;
  declare sendTime: string;
  declare isRead: boolean;
  // declare createdAt: CreationOptional<Date>;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID, // UUID 類型
      defaultValue: DataTypes.UUIDV4, // 自動生成 UUID
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    receiverId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sendTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // 預設值為 false
    },
  },
  {
    sequelize,
    tableName: 'message',
    timestamps: false,
  },
);

// async function syncDatabase() {
//   try {
//     // 同步所有定義的模型到數據庫
//     await sequelize.sync({ alter: true });
//     console.log('數據庫同步完成');

//     // 您也可以單獨同步特定的模型
//     await Message.sync({ alter: true });
//     // await Friend.sync({ alter: true });

//   } catch (error) {
//     console.error('數據庫同步失敗:', error);
//   }
// }

// syncDatabase()

export default Message;

import { DataTypes, Model, CreationOptional } from 'sequelize';
import sequelize from '../config/mysql';
import Users from './authModel';

export class Friendship extends Model {
  declare id: number;
  declare userId: string;
  declare friendId: string;
  declare status: number; // 0等待 1接受 2拒絕
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Friendship.init(
  {
    id: {
      type: DataTypes.NUMBER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Users,
        key: 'uuid',
      },
    },
    friendId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Users,
        key: 'uuid',
      },
    },
    status: {
      type: DataTypes.INTEGER, // 0: pending 1: accept 2: reject 3: block
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    messageUpdatedAt: {
      allowNull: false,
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'friendship',
    sequelize,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'friendId'], // 防止重复关系
      },
    ],
  },
);

// 设置模型关联
Users.hasMany(Friendship, { foreignKey: 'userId', as: 'sentRequests' });
Users.hasMany(Friendship, { foreignKey: 'friendId', as: 'receivedRequests' });

Friendship.belongsTo(Users, { foreignKey: 'userId', as: 'requester' });
Friendship.belongsTo(Users, { foreignKey: 'friendId', as: 'receiver' });

export default Friendship;

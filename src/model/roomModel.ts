import sequelize from '../config/mysql';

import { DataTypes, Model, CreationOptional } from 'sequelize';

export class Room extends Model {
  declare uuid: string;
  declare title: string;
  declare description: string;
  declare image: string;
  declare startTime: string;
  declare createdAt: CreationOptional<Date>;
}

Room.init(
  {
    uuid: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // TODO 測試完後改為不可null
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'rooms',
    timestamps: false,
  },
);

export default Room;

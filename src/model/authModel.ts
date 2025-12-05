import sequelize from '../config/mysql';
// import { UserParams, GetUserResponse, SetUserName } from '@/types/auth';
import {
  DataTypes,
  Model,
  CreationOptional,
  HasManyAddAssociationMixin,
  HasManyGetAssociationsMixin,
  QueryTypes,
} from 'sequelize';
// import { GroupUser } from './groupAuthModel';
// import { Groups } from './groupModel';
// import { GroupUser } from './groupAuthModel';
// import moment from 'moment';
// import { catchAsyncSql } from '@/utils/catchAsync';
// import { NextFunction } from 'express';

// 定義 Users 模型
export class Users extends Model {
  declare uuid: string;
  declare email: string;
  declare password: string;
  declare phone: string;
  declare avatars: string[];
  declare forWhat: string;
  declare isPasswordSign: boolean;
  declare userName: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // declare setGroups: HasManySetAssociationsMixin<Groups, `${string}-${string}-${string}-${string}-${string}`> // <關聯的表, 外建的type>
  // declare getGroups: HasManyGetAssociationsMixin<Groups>

  // public readonly createdAt!: Date;
  // public readonly updatedAt!: Date;
}

Users.init(
  {
    uuid: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // phone: {
    //   type: DataTypes.STRING,
    //   allowNull: true,
    // },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    avatars: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: true,
    },
    gender: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // forWhat: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    isPasswordSign: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        len: [8, 32],
      },
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [0, 150],
      },
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: false,
  },
);

// const c = sequelize.getQueryInterface()
// const init = async () => {
//   try {
//     await c.addColumn('users', 'description', {
//       type: DataTypes.STRING,
//       allowNull: false,
//     })
//     // await c.removeColumn('users', 'description')
//   } catch (error) {
//     console.log(error, 'err')
//   }
// }

// init()

// const descriptionSender = async () => {
//   await sequelize.query(`
//   UPDATE users
//   SET description = SUBSTRING(MD5(RAND()), 1, 10)
//   WHERE description IS NULL OR description = ''
// `, { type: QueryTypes.UPDATE });
// }

// descriptionSender()
// Users.sync({ force: false }) // 這裡可以選擇是否要使用 force
//   .then(() => {
//     console.log('User table synced!');
//   })
//   .catch((error) => {
//     console.error('Error syncing User table:', error);
//   });

export default Users;

// async function syncDatabase() {
//   try {
//     // 同步所有定義的模型到數據庫
//     await sequelize.sync({ alter: true });
//     console.log('數據庫同步完成');

//     // 您也可以單獨同步特定的模型
//     // await Users.sync({ alter: true });
//     // await Friend.sync({ alter: true });

//   } catch (error) {
//     console.error('數據庫同步失敗:', error);
//   }
// }

// // 在應用啟動時調用此函數
// syncDatabase();

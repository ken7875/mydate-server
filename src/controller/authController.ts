import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { errorHandler } from '@/utils/errorHandler';
import { catchAsyncController } from '@/utils/catchAsync';
import Users from '@/model/authModel';
// import { setUserCode, getUserCode } from '@/model/registerCodeModel';
import validator from 'validator';
import { sendEmail } from '@/utils/email';
import crypto from 'crypto';
import { DecodedToken } from './types/auth';
import multer from 'multer';
import sharp from 'sharp';
import AppError from '@/utils/appError';
import { getUserByMail, findUserById } from './userController';

const signToken = ({ email, uuid }: { email: string; uuid: string }): string =>
  jwt.sign({ email, uuid }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.EXPIRES_IN,
  });

const createToken = (user: { email: string; uuid: string }) => {
  const { email, uuid } = user;

  const token = signToken({ email, uuid });

  return token;
};

const register =
  ({
    email,
    uuid,
  }: {
    email: string;
    uuid: `${string}-${string}-${string}-${string}-${string}`;
  }) =>
  async () => {
    const user = await Users.create({
      email,
      uuid,
    });

    return user;
  };

export const verifyToken = catchAsyncController(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  // else if (req.cookie.jwt) {
  //   token = req.cookie.jwt;
  // }

  if (!token) {
    errorHandler({
      res,
      info: {
        code: 401,
        message: '請先登入',
      },
      sendType: 'json',
    });

    return;
  }

  try {
    const decoded = (await jwt.verify(
      token!,
      process.env.JWT_SECRET!,
    )) as DecodedToken;

    const freshUser = await findUserById(decoded.uuid);

    //   if (!freshUser) next(new AppError("查無此用戶!", 401));

    //   if (freshUser.changePasswordAfter(decoded.iat)) {
    //     next(new AppError("此用戶的密碼已經更變，請確認密碼!", 401));
    //   }

    req.user = freshUser;
    next();
  } catch (error) {
    errorHandler({
      res,
      info: {
        code: 401,
        message: '請先登入',
      },
      sendType: 'json',
    });
  }
});

const setUserPasswordHandler = async ({
  email,
  password,
  isPasswordSign,
}: {
  email: string;
  password: string;
  isPasswordSign: boolean;
}) => {
  // const queryString = 'UPDATE users SET password = ?, isPasswordSign = ? WHERE email = ?'
  // const rows = await sql<GetUserResponse>(queryString, [password, Number(isPasswordSign), email]);
  const user = await Users.update(
    {
      password,
      isPasswordSign,
    },
    {
      where: {
        email,
      },
    },
  );

  return user;
};

const setUserInfoHandler = async ({
  email,
  userName,
}: {
  email: string;
  userName: string;
}) => {
  // const queryString = 'UPDATE users SET userName = ? WHERE email = ?'
  // const rows = await sql<SetUserName>(queryString, [userName, email]);
  const user = await Users.update(
    {
      userName,
    },
    {
      where: {
        email,
      },
    },
  );

  return user;
};

const generateLoginCode = () => {
  let res = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';

  for (let i = 0; i < 5; i++) {
    const segmentLength = Math.floor(Math.random() * 3) + 3;
    for (let j = 0; j < segmentLength; j++) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      res += alphabet[randomIndex];
    }

    if (i < 4) {
      // 最後一組不用加上-
      res += '-';
    }
  }

  return res;
};

// 寄出驗證碼
export const sendVcodeToMail = async (
  {
    email,
    code,
    hasAccount,
  }: { email: string; code: string; hasAccount: boolean },
  res: Response,
) => {
  const userMail = await getUserByMail(email);

  if (userMail) {
    const subject = hasAccount ? 'Login' : 'Sign up';
    const mailOptions = {
      email,
      subject,
      html: `<h1>Login</h1><p>copy and paste this temporary login code:</p><pre style="border: 1px solid #eeeeee; background-color: #f4f4f4; border-radius: 4px; padding: 16px 24px;">${code}</pre>`,
    };

    const mailRes = await sendEmail(mailOptions);
    if (mailRes === 'fail') {
      errorHandler({
        res,
        info: {
          code: 400,
          message: 'can not find your email',
        },
        sendType: 'json',
      });
      // next(new AppError('can not find your email', 400))

      return;
    }

    // challengeProvider: "turnstile"
    // hasAccount: boolean
    // loginOptionsToken: ""
    // samlSignIn: "unavailable"
  }
};

// 產出驗證碼
let timer: ReturnType<typeof setTimeout> | null = null;
export const setCode = async (
  { email, hasAccount }: { email: string; hasAccount: boolean },
  res: Response,
) => {
  if (!email || !validator.isEmail(email)) {
    // next(new AppError('Invalid email address', 400))
    errorHandler({
      res,
      info: {
        code: 400,
        message: 'Invalid email address',
      },
      sendType: 'json',
    });

    return;
  }

  const loginCode = generateLoginCode();
  await sendVcodeToMail({ email, code: loginCode, hasAccount }, res);
  await setUserPasswordHandler({
    email,
    password: loginCode,
    isPasswordSign: false,
  });
  // 驗證碼5分鐘後過期
  timer = setTimeout(() => {
    setUserPasswordHandler({ email, password: '', isPasswordSign: false });
  }, 300000);
};

export const loginMethods = catchAsyncController(
  async (req: Request, res: Response) => {
    const { email }: { email: string } = req.body;
    const user = await getUserByMail(email);

    if (!email) {
      // next(new AppError('信箱不得為空', 400))
      errorHandler({
        res,
        info: {
          code: 400,
          message: '信箱不得為空',
        },
        sendType: 'json',
      });

      return;
    }

    if (user) {
      const isPasswordSign =
        user?.isPasswordSign !== undefined && user?.isPasswordSign;

      if (!isPasswordSign) {
        await setCode({ email, hasAccount: false }, res);
      }
      const msg = user.isPasswordSign
        ? 'login success'
        : "valid code has been send tp user's mail";

      res.status(200).json({
        status: 'success',
        message: msg,
        code: 200,
        data: {
          hasAccount: true,
          isPasswordSign,
        },
      });
    } else {
      const uuid = crypto.randomUUID();
      const row = await register({ email, uuid })();
      await setCode({ email, hasAccount: false }, res);
      const msg = row.isPasswordSign
        ? 'login success'
        : "valid code has been send tp user's mail";
      res.status(200).json({
        status: 'success',
        message: msg,
        code: 200,
        data: {
          hasAccount: false,
          isPasswordSign: false,
        },
      });
    }
  },
);

const veriyfyPasswordHandler = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  // const rows = await getUserCode({ email }, next)();
  const userMail = await getUserByMail(email);
  const veriyfyCode = userMail?.password;
  if (password !== veriyfyCode) {
    return false;
  }

  return true;
};

export const loginWithEmail = catchAsyncController(
  async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: `請輸入${!email ? '帳號' : '密碼'}`,
        },
        sendType: 'json',
      });

      return;
    }

    const user = await getUserByMail(email);
    const isVerify = await veriyfyPasswordHandler({ email, password });

    if (!isVerify) {
      // next(new AppError(user?.isPasswordSign ? 'incorrect password' : 'invalid code', 400))
      errorHandler({
        res,
        info: {
          code: 400,
          message: user?.isPasswordSign ? 'incorrect password' : 'invalid code',
        },
        sendType: 'json',
      });

      return;
    }

    const token = createToken({ email: user!.email, uuid: user!.uuid });
    // wss.init()
    // wss.send
    res.status(200).json({
      status: 'success',
      message: 'login success',
      code: 200,
      data: {
        isPasswordSign: user?.isPasswordSign,
        token,
        uuid: user?.uuid,
        email,
        userName: user?.userName,
      },
    });
  },
);

export const setUserPassword = catchAsyncController(
  async (req: Request, res: Response) => {
    const { password, email } = req.body;

    if (!password) {
      // next(new AppError('password can not be empty', 400))
      errorHandler({
        res,
        info: {
          code: 400,
          message: 'password can not be empty',
        },
        sendType: 'json',
      });

      return;
    }

    if (!email) {
      // next(new AppError('email can not be empty', 400))
      errorHandler({
        res,
        info: {
          code: 400,
          message: 'email can not be empty',
        },
        sendType: 'json',
      });
      return;
    }

    await setUserPasswordHandler({ email, password, isPasswordSign: true });
    // 清除登入驗證碼期效倒數計時器
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    res.status(200).json({
      status: 'success',
      message: 'login success',
      code: 200,
      data: {
        hasAccount: true,
        // isPasswordSign: row?.isp,
      },
    });
  },
);

export const setUserInfo = catchAsyncController(
  async (req: Request, res: Response) => {
    const { email, userName, uuid } = req.body;
    await setUserInfoHandler({ email, userName });
    const user = await findUserById(uuid);

    res.status(200).json({
      status: 'success',
      message: 'set user info success',
      code: 200,
      data: {
        ...user?.dataValues,
      },
    });
  },
);

export const getUserInfo = catchAsyncController(
  async (req: Request, res: Response) => {
    const user = await findUserById(req.user?.uuid as string);
    const data = {
      ...user?.dataValues,
      avatars: user?.dataValues?.avatars?.map?.(
        (fileName: string) => `${fileName}.jpeg`,
      ),
    };

    res.status(200).json({
      status: 'success',
      message: 'set user info success',
      code: 200,
      data,
    });
  },
);

export const uploadUserPhoto = (() => {
  const multerStorage = multer.memoryStorage();
  const upload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 50 * 1024 * 1024, // 限制 2 MB
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image')) {
        cb(null, true);
      } else {
        cb(new AppError('請回傳正確照片格式', 400));
      }
    },
  });

  return upload.fields([
    {
      name: 'photos',
      maxCount: 5,
    },
  ]);
})();

export const reseizePhoto = catchAsyncController(
  async (req: Request, res: Response, next: NextFunction) => {
    // if (req.body)
    const files = (
      req.files as unknown as {
        photos: {
          fieldname: string;
          originalname: string;
          encoding: string;
          minetype: 'image/jpeg';
          buffer: Buffer;
          size: number;
        }[];
      }
    )?.photos;
    if (!files || files.length === 0) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請給圖片',
        },
        sendType: 'json',
      });

      return;
    }

    req.body.images = [];
    await Promise.all(
      files.map(async (photo) => {
        const fileName = `${req.user?.userName}-${Date.now()}`;
        await sharp(photo.buffer)
          .resize(300, 300)
          .toFormat('jpeg')
          .jpeg({ quality: 90 })
          .toFile(`public/${fileName}.jpeg`);
        req.body.images.push(fileName);
      }),
    );

    next();
  },
);

export const saveAvatars = catchAsyncController(
  async (req: Request, res: Response) => {
    const user = await Users.findByPk(req.user?.uuid, {
      attributes: ['avatars'],
    });

    let avatars = user?.avatars || [];

    if (!Array.isArray(avatars)) avatars = [];

    avatars = avatars.concat(req.body.images);

    Users.update(
      {
        avatars,
      },
      {
        where: {
          uuid: req.user?.uuid,
        },
      },
    );

    res.status(201).json({
      status: 'success',
      message: 'set avatars success',
    });
  },
);

export const getAvatars = catchAsyncController(
  async (req: Request, res: Response) => {
    const user = await Users.findByPk(req.user?.uuid, {
      attributes: ['avatars'],
    });

    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: '找不到該使用者',
      });
    }

    const { avatars } = user.dataValues;
    const avatarUrls = avatars.map((fileName: string) => `${fileName}.jpeg`);

    res.status(200).json({
      status: 'success',
      data: avatarUrls,
    });

    // const { avatars } = user.dataValues;
    // const avatarFileName = avatars[0] + '.jpeg';

    // const imagePath = path.join(__dirname, '../../public/', avatarFileName);

    // res.sendFile(imagePath);
  },
);
// export const validateLoginCode = catchAsyncController(async(req: Request, res: Response) => {
//     const { loginCode } = req.body

//     if(!loginCode) next(new AppError('請輸入正確的驗證碼', 400))
// })
// // 沒有使用 Recursive Type
// type ValueOrArray<T> = T | T[];

// // 使用了 Recursive Type Aliases
// type SnakeToCamelCase<T extends string> = T extends `${infer Head}_${infer Tail}` ? `${Uncapitalize<Head>}_${Uncapitalize<Tail>}` : T

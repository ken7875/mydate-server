export interface AuthParams {
  email: string;
  password: string;
}

export interface userInfoParams {
  phone: string;
  email: string;
  avatars?: string;
  forWhat?: string;
}

export interface UserParams {
  email: string;
  password: string;
}

export interface GetUserResponse {
  email: string;
  phone: string;
  avatars?: string;
  forWhat?: string;
}

export interface SetUserName {
  userName: string;
}

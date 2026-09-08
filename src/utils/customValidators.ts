import { isEmail } from "validator";

const isValidBBYDIEmail = (email: string) => {
  const extended = email.split("@")[1];
  if (extended !== "thebrainbuilders.org") {
    throw new Error("Email must be a valid BBYDI email address");
  }
};

export const isValidEmail = (email: string): boolean => {
  const isEmailValid = isEmail(email);
  isValidBBYDIEmail(email);
  if (!isEmailValid) {
    throw new Error("Invalid email address");
  }
  return true;
};

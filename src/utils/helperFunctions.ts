import { v4 as uuidv4 } from 'uuid';

/**
 * Get the current date and time in the MySQL date format in UTC.
 * Usable for the createdAt and updatedAt fields. and any other fields that
 * is going to be read by other microservices. (e.g. the admin portal, the core API)
 */
export function getMySQLDateFormatUTC() {
  // Create a new Date object
  const date = new Date();

  // Convert the Date object to UTC
  const dateUTC = new Date(date.getTime() + date.getTimezoneOffset() * 60000);

  // Format the UTC date to the MySQL date format
  const year = dateUTC.getFullYear();
  const month = ('0' + (dateUTC.getMonth() + 1)).slice(-2);
  const day = ('0' + dateUTC.getDate()).slice(-2);
  const hours = ('0' + dateUTC.getHours()).slice(-2);
  const minutes = ('0' + dateUTC.getMinutes()).slice(-2);
  const seconds = ('0' + dateUTC.getSeconds()).slice(-2);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function newUUID() {
  return uuidv4();
}

export function isValidUrl(string) {
  try {
    if (string.length < 1) return false;
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

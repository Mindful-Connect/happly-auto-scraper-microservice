import { HydratedDocument } from 'mongoose';

export async function saveSafely(document: HydratedDocument<any>, maxRetries = 3, retries = 0) {
  try {
    await document.save();
  } catch (e) {
    if (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await saveSafely(document, maxRetries, retries + 1);
    } else {
      console.error('error saving document twice (parallel).', e);
    }
  }
}

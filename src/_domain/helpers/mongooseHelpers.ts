import { HydratedDocument } from 'mongoose';

export async function saveSafely(document: HydratedDocument<any>, retries = 0) {
  try {
    await document.save();
  } catch (e) {
    if (retries < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await saveSafely(document, retries + 1);
    } else {
      console.log('error saving document twice (parallel).');
    }
  }
}

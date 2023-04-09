import { HydratedDocument } from 'mongoose';
import { from, mergeMap, retryWhen, throwError, timer } from 'rxjs';

export async function saveSafely(document: HydratedDocument<any>) {
  const source = from(document.save()).pipe(
    retryWhen(errors =>
      errors.pipe(
        mergeMap((error, i) => {
          console.log('error', error, 'i', i);
          const retryAttempt = i + 1;
          if (retryAttempt > 3) {
            throw throwError(error);
          }
          return timer(retryAttempt * 1000);
        }),
      ),
    ),
  );
  const subscription = source.subscribe(
    () => subscription.unsubscribe(),
    error => console.error('error saving document: ', error),
  );
}

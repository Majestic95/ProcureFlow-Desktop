/**
 * @fileoverview
 * This file contains the error emitter that is used to emit errors.
 * This is useful for debugging and for displaying errors to the user.
 */

import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

/**
 * The events that can be emitted by the error emitter.
 *
 * @property permission-error A Firestore permission error has occurred.
 */
type ErrorEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

/**
 * The error emitter that is used to emit errors.
 * This is useful for debugging and for displaying errors to the user.
 */
class ErrorEmitter extends EventEmitter {
  constructor() {
    super();
  }

  emit<T extends keyof ErrorEvents>(event: T, ...args: Parameters<ErrorEvents[T]>): boolean {
    return super.emit(event, ...args);
  }

  on<T extends keyof ErrorEvents>(event: T, listener: ErrorEvents[T]): this {
    return super.on(event, listener);
  }
}

export const errorEmitter = new ErrorEmitter();

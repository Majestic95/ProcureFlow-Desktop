/**
 * @fileoverview
 *
 * This file contains the error types that are used in the application.
 * It is used to create a consistent error handling experience for the user.
 *
 * It is also used to create a consistent error handling experience for the
 * developer. This is done by creating a custom error class that can be
 * thrown when a Firestore permission error occurs. This error can then be
 * caught and handled in a consistent way.
 *
 * It is also used by the agent to debug and fix errors.
 */

/**
 * The context of a security rule error.
 *
 * @property path The path of the document that was being accessed.
 * @property operation The operation that was being performed.
 * @property requestResourceData The data that was being sent to the server.
 */
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any;
};

/**
 * A custom error class that is thrown when a Firestore permission error occurs.
 * This is useful for debugging security rules.
 */
export class FirestorePermissionError extends Error {
  public readonly context: SecurityRuleContext;
  constructor(context: SecurityRuleContext) {
    const { path, operation, requestResourceData } = context;

    // Create a detailed error message for developers.
    const details = {
      message: `The following request was denied by Firestore Security Rules:`,
      details: {
        path: path,
        operation: operation,
        ...(requestResourceData && {
          requestResourceData: JSON.stringify(requestResourceData, null, 2),
        }),
      },
    };

    super(
      `FirestoreError: Missing or insufficient permissions: ${JSON.stringify(
        details,
        null,
        2
      )}`
    );

    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is to make the error message more readable in the console.
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}

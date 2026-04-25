





// Minimal typings for react-dom createPortal when @types/react-dom is not present
declare module 'react-dom' {
    export function createPortal(children: any, container: any): any;
}

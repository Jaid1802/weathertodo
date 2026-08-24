import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    backdropFilter?: string;
    outlineStyle?: string;
    WebkitBackdropFilter?: string;
  }
  interface TextStyle {
    outlineStyle?: string;
    backdropFilter?: string;
  }
}

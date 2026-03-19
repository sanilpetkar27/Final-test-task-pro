declare module '@expo/vector-icons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';

  export type IconProps = TextProps & {
    name: string;
    size?: number;
    color?: string;
  };

  export const Ionicons: ComponentType<IconProps>;
}

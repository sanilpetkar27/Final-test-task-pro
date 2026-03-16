import { colors } from '../tokens/colors';

export const lumina = {
  bg: {
    app: '#F6F8FC',
    surface: '#FFFFFF',
    card: 'rgba(255,255,255,0.82)',
    elevated: '#FFFFFF',
  },
  text: {
    primary: colors.slate900,
    secondary: colors.slate500,
    inverse: colors.white,
  },
  border: {
    subtle: colors.slate200,
    focus: colors.teal500,
  },
  action: {
    primary: colors.teal600,
    primaryPressed: '#0B7D73',
    danger: colors.red500,
  },
  status: {
    success: colors.emerald500,
    warning: colors.amber500,
    danger: colors.red500,
    info: colors.blue500,
  },
  dot: {
    pending: colors.pastelAmber,
    progress: colors.pastelBlue,
    done: colors.pastelMint,
    overdue: colors.pastelRose,
  },
  shadow: {
    card: 'rgba(15,23,42,0.07)',
  },
} as const;

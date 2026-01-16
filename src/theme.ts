import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7c4dff'
    },
    secondary: {
      main: '#00bcd4'
    },
    background: {
      default: '#0f1115',
      paper: '#161a22'
    }
  },
  shape: {
    borderRadius: 16
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif'
  }
});

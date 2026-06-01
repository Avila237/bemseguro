/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Bem Seguro Hub
        primary: {
          DEFAULT: '#E8723A', // laranja primario
          dark: '#C75B28',    // laranja escuro (fundo do logo)
        },
        sidebar: '#1F2937',   // sidebar escuro
        canvas: '#F9FAFB',    // fundo da area de conteudo
        ink: '#111827',       // texto principal
        status: {
          green: '#16A34A',
          blue: '#2563EB',
          red: '#DC2626',
          amber: '#D97706',
          gray: '#6B7280',
        },
      },
    },
  },
  plugins: [],
};

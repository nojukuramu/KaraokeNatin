/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    500: '#667eea',
                    600: '#5a67d8',
                    700: '#4c51bf',
                },
                secondary: {
                    500: '#764ba2',
                    600: '#6b3fa0',
                    700: '#5e3588',
                },
            },
        },
    },
    plugins: [],
}

export const metadata = {
  title: "Phone Interview Copilot",
  description: "Record room audio and get transcript + coaching."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

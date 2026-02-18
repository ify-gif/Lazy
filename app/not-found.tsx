export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
            <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
            <p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
            <a
                href="/"
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-all font-medium"
            >
                Return Home
            </a>
        </div>
    );
}

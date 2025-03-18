/**
 * Footer component for the Hours application
 */
export const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-800 text-white py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p>&copy; {currentYear} Time Tracking System. All rights reserved.</p>
          </div>
          <div className="flex space-x-4">
            <a href="/privacy" className="hover:text-gray-300">Privacy Policy</a>
            <a href="/terms" className="hover:text-gray-300">Terms of Service</a>
            <a href="/help" className="hover:text-gray-300">Help Center</a>
          </div>
        </div>
      </div>
    </footer>
  );
}; 
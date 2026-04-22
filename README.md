# LegalConnect - React Frontend Application

A complete React.js frontend application for connecting clients with lawyers. This application provides a comprehensive platform for booking appointments, managing documents, and communicating with legal professionals.

## Features

### For Clients

- **Lawyer Search**: Search and filter lawyers by name, specialization, and location
- **Appointment Booking**: Schedule consultations with lawyers
- **Document Management**: Upload and manage legal documents
- **Client Dashboard**: View upcoming appointments, documents, and case progress
- **Real-time Chat**: Communicate with lawyers via chat interface

### For Lawyers

- **Lawyer Dashboard**: Manage appointments, view client documents, and chat notifications
- **Profile Management**: Edit profile information
- **Client Communication**: Chat with clients and review documents

### General Features

- **Authentication**: Separate login and registration for clients and lawyers
- **Responsive Design**: Mobile-friendly interface
- **Form Validation**: Client-side validation for all forms
- **Star Ratings**: Display lawyer ratings
- **Case Timeline**: Visual progress tracking for cases

## Project Structure

```
LegalConnect/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Footer/
│   │   ├── Header/
│   │   ├── Sidebar/
│   │   ├── StarRating/
│   │   └── Timeline/
│   ├── pages/
│   │   ├── Auth/
│   │   │   ├── Login.js
│   │   │   └── Register.js
│   │   ├── Dashboard/
│   │   │   ├── ClientDashboard.js
│   │   │   └── LawyerDashboard.js
│   │   ├── Home/
│   │   ├── LawyerSearch/
│   │   ├── AppointmentBooking/
│   │   ├── DocumentUpload/
│   │   ├── Chat/
│   │   └── Contact/
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── package.json
└── README.md
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm start
```

The application will open at `http://localhost:3000`

## API Endpoints

The application makes API calls to the following endpoints (placeholder endpoints):

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Lawyers

- `GET /api/lawyers` - Get list of lawyers
- `GET /api/lawyer/profile` - Get lawyer profile
- `PUT /api/lawyer/profile` - Update lawyer profile
- `GET /api/lawyer/appointments` - Get lawyer appointments
- `GET /api/lawyer/documents` - Get client documents
- `GET /api/lawyer/notifications` - Get notifications

### Appointments

- `GET /api/appointments` - Get user appointments
- `POST /api/appointments` - Book new appointment

### Documents

- `GET /api/documents` - Get user documents
- `POST /api/documents/upload` - Upload document

### Chat

- `GET /api/chat/users` - Get chat users
- `GET /api/chat/messages/:userId` - Get messages with user
- `POST /api/chat/send` - Send message

### Contact

- `POST /api/contact` - Send contact form

### Cases

- `GET /api/cases/progress` - Get case progress

## Technologies Used

- **React 18.2.0** - UI library
- **React Router DOM 6.20.0** - Routing
- **Axios 1.6.2** - HTTP client
- **CSS Modules** - Component-scoped styling

## Key Components

### Reusable Components

- **Header**: Navigation header with responsive menu
- **Footer**: Site footer with links and information
- **Sidebar**: Navigation sidebar for dashboards
- **Button**: Reusable button component with variants
- **Card**: Container component for content
- **StarRating**: Display star ratings
- **Timeline**: Visual timeline for case progress

### Pages

- **Home**: Landing page with hero section and services overview
- **Login/Register**: Authentication pages for clients and lawyers
- **LawyerSearch**: Search and filter lawyers
- **AppointmentBooking**: Book appointments with lawyers
- **ClientDashboard**: Client dashboard with appointments and documents
- **LawyerDashboard**: Lawyer dashboard with appointments and profile
- **DocumentUpload**: Upload legal documents
- **Chat**: Real-time chat interface
- **Contact**: Contact form page

## Styling

The application uses CSS Modules for component-scoped styling. Each component has its own `.module.css` file. The design is:

- Clean and modern
- Fully responsive (mobile and desktop)
- Uses a consistent color scheme
- Includes hover effects and transitions

## Authentication

The application uses localStorage to store authentication tokens. In a production environment, you should:

- Use secure HTTP-only cookies
- Implement proper token refresh
- Add route protection
- Validate tokens on the backend

## Sample Data

The application includes sample data for demonstration purposes. In a real application, this would come from your backend API.

## Development Notes

- All API calls use placeholder endpoints (`/api/...`)
- WebSocket functionality for chat is simulated with polling
- File upload uses FormData for multipart/form-data
- Forms include client-side validation
- Error handling is implemented for all API calls

## Future Enhancements

- Implement actual WebSocket connections for real-time chat
- Add route protection/guards
- Implement proper authentication flow
- Add loading states and skeletons
- Add toast notifications
- Implement pagination for lists
- Add search functionality enhancements
- Implement file preview functionality

## License

This project is created for demonstration purposes.

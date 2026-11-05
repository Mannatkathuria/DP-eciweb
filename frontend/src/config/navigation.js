// The site's navigation, defined once. Each destination appears in exactly one place in the menus.
export const NAV = [
  { label: "Home", to: "/home" },
  {
    label: "Voters",
    to: "/voters",
    items: [
      { label: "Voter Mitra", note: "Ask in your own words which form and documents you need", to: "/voters" },
      { label: "Register as a new voter", note: "Apply for inclusion in the roll", to: "/register" },
      { label: "Find your name in the roll", note: "Search by EPIC number or details", to: "/electoral-roll" },
      { label: "Find your polling station", note: "Where you vote, with facilities and any relocation", to: "/booths" },
      { label: "Polling station map", note: "Every approved station on a map", to: "/map" },
      { label: "Forms 2, 2A, 3, 6A, 6B, 7, 8", note: "Service voters, overseas electors, objections, corrections", to: "/voters/forms" },
      { label: "Appeal an ERO's decision", note: "First and second appeals on the roll", to: "/appeal" },
      { label: "Grievances", note: "Complain about an election service and track it", to: "/grievance" },
      { label: "Postal ballot (service voters)", note: "Open, print and track your ballot", to: "/postal-ballot" },
      { label: "Track an application", note: "Check a request with its reference ID", to: "/check-request" },
    ]
  },
  {
    label: "Elections",
    items: [
      { label: "Report a violation", note: "Model Code of Conduct complaints", to: "/report-violation" },
      { label: "Candidates and parties", note: "Nominations, permissions, candidate details", to: "/candidates" },
      { label: "Results and counting", note: "Turnout, rounds and scrutiny", to: "/results" },
      { label: "Election observers", note: "Who is watching your constituency, and how to reach them", to: "/observers" }
    ]
  },
  { label: "States", states: true },
  {
    label: "Information",
    items: [
      { label: "Library", note: "Handbooks, instructions, eBooks, FAQ and training material", to: "/library" },
      { label: "Awareness and media", note: "Publications, EVM questions, voter education", to: "/media" },
      { label: "Roles and access", note: "Who does what, and what each role may do", to: "/roles" },
      { label: "Training for election staff", note: "Practice modules for your role (sign in)", to: "/training" }
    ]
  }
];

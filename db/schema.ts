import { index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    totalPages: integer("total_pages").notNull(),
    unit: text("unit", { enum: ["pages", "chapters", "percent"] }).notNull().default("pages"),
    coverUrl: text("cover_url"),
    personalCompletedAt: text("personal_completed_at"),
    currentPage: integer("current_page").notNull().default(0),
    status: text("status", { enum: ["want_to_read", "reading", "completed"] }).notNull().default("reading"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_books_owner_status").on(table.ownerId, table.status),
    index("idx_books_owner_updated").on(table.ownerId, table.updatedAt),
  ]
);

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    targetBooks: integer("target_books").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_goals_owner_end").on(table.ownerId, table.endDate)]
);

export const users = sqliteTable("reading_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["teacher", "student"] }).notNull(),
  inviteCode: text("invite_code").unique(),
  createdAt: text("created_at").notNull(),
});
export const links = sqliteTable("teacher_students", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  studentId: text("student_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
}, t => [index("idx_links_teacher").on(t.teacherId), index("idx_links_student").on(t.studentId), uniqueIndex("idx_links_pair").on(t.teacherId, t.studentId)]);
export const classes = sqliteTable("reading_classes", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  version: integer("version").notNull().default(0),
  mutationKey: text("mutation_key"),
}, t => [index("idx_classes_teacher").on(t.teacherId)]);
export const classMembers = sqliteTable("reading_class_members", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id),
  studentId: text("student_id").notNull().references(() => users.id),
  joinedAt: text("joined_at").notNull(),
}, t => [uniqueIndex("idx_class_member_pair").on(t.classId,t.studentId),index("idx_class_members_student").on(t.studentId)]);
export const classBooks = sqliteTable("reading_class_books", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull().references(() => classes.id),
  bookId: text("book_id").notNull().references(() => books.id),
  assignedAt: text("assigned_at").notNull(),
  deadline: text("deadline"),
  deadlineInitialized: integer("deadline_initialized").notNull().default(0),
  version: integer("version").notNull().default(0),
}, t => [uniqueIndex("idx_class_books_pair").on(t.classId,t.bookId)]);
export const assignments = sqliteTable("reading_assignments", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  studentId: text("student_id").notNull().references(() => users.id),
  bookId: text("book_id").notNull().references(() => books.id),
  assignedAt: text("assigned_at").notNull(),
  classId: text("class_id").references(() => classes.id),
  classAssignmentId: text("class_assignment_id").references(() => classBooks.id),
  originKey: text("origin_key").notNull().default("individual"),
  deadline: text("deadline"),
  progress: integer("progress").notNull().default(0),
  startedAt: text("started_at"),
  updatedAt: text("updated_at"),
  completedAt: text("completed_at"),
  version: integer("version").notNull().default(0),
}, t => [uniqueIndex("idx_assignment_origin").on(t.bookId, t.studentId, t.originKey), uniqueIndex("idx_assignment_class_student").on(t.classAssignmentId,t.studentId), index("idx_assignments_class").on(t.classId), index("idx_assignment_teacher").on(t.teacherId), index("idx_assignment_student").on(t.studentId)]);
export const progressEvents = sqliteTable("reading_events", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => assignments.id),
  progress: integer("progress").notNull(),
  previousProgress: integer("previous_progress").notNull(),
  createdAt: text("created_at").notNull(),
  version: integer("version").notNull(),
  kind: text("kind",{enum:['progress','correction']}).notNull().default('progress'),
  actorId: text("actor_id").references(()=>users.id),
  reason: text("reason").notNull().default(''),
  completionDeadline: text("completion_deadline"),
  deadlineRecorded: integer("deadline_recorded").notNull().default(0),
}, t => [index("idx_events_assignment_date").on(t.assignmentId, t.createdAt), uniqueIndex("idx_events_version").on(t.assignmentId,t.version)]);

export const deadlineEvents=sqliteTable('reading_deadline_events',{
 id:text('id').primaryKey(),teacherId:text('teacher_id').notNull().references(()=>users.id),
 classAssignmentId:text('class_assignment_id').references(()=>classBooks.id),
 assignmentId:text('assignment_id').references(()=>assignments.id),
 operationId:text('operation_id').references(():AnySQLiteColumn=>deadlineEvents.id),
 consolidation:integer('consolidation').notNull().default(0),
 previousDeadline:text('previous_deadline'),deadline:text('deadline'),
 createdAt:text('created_at').notNull(),
},t=>[index('idx_deadline_class').on(t.classAssignmentId),index('idx_deadline_assignment').on(t.assignmentId)]);

// The student's primary key is their matrícula. No generated student UUID.
export const managedStudents = sqliteTable('managed_students', {
 studentId:text('student_id').primaryKey().references(()=>users.id),
 teacherId:text('teacher_id').notNull().references(()=>users.id),
 legacyIdentity:text('legacy_identity').unique(),email:text('email'),passwordHash:text('password_hash').notNull(),
 mustChangePassword:integer('must_change_password').notNull().default(1),
 active:integer('active').notNull().default(1),
 authVersion:integer('auth_version').notNull().default(0),
 version:integer('version').notNull().default(0),
},t=>[index('idx_managed_teacher').on(t.teacherId)]);
export const studentSessions=sqliteTable('student_sessions',{
 tokenHash:text('token_hash').primaryKey(),studentId:text('student_id').notNull().references(()=>users.id),
 authVersion:integer('auth_version').notNull(),expiresAt:integer('expires_at').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_student_sessions_student').on(t.studentId),index('idx_student_sessions_expiry').on(t.expiresAt)]);
export const loginAttempts=sqliteTable('student_login_attempts',{
 key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_login_attempt_expiry').on(t.expiresAt)]);
export const accountEvents=sqliteTable('student_account_events',{
 id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>users.id),teacherId:text('teacher_id').notNull().references(()=>users.id),
 action:text('action').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_student_account_events_student').on(t.studentId)]);

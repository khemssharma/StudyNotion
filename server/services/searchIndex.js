const Course = require("../models/Course");
const Trie = require("../utils/trie");

const trie = new Trie();
let isReady = false;

function indexCourse(course) {
  const instructor = course.instructor;
  const instructorName = instructor
    ? [instructor.firstName, instructor.lastName].filter(Boolean).join(" ")
    : "";

  trie.insert(course.courseName, {
    type: "course",
    id: course._id.toString(),
    courseId: course._id.toString(),
    thumbnail: course.thumbnail,
    instructorName,
  });

  if (instructor && instructor._id) {
    trie.insert(instructorName, {
      type: "instructor",
      id: instructor._id.toString(),
      instructorId: instructor._id.toString(),
      image: instructor.image,
    });
  }

  if (Array.isArray(course.tag)) {
    for (const tag of course.tag) {
      trie.insert(tag, {
        type: "tag",
        id: tag.toLowerCase(),
        courseId: course._id.toString(),
      });
    }
  }

  if (course.category?.name) {
    trie.insert(course.category.name, {
      type: "category",
      id: course.category._id.toString(),
      courseId: course._id.toString(),
    });
  }
}

async function rebuild() {
  trie.clear();

  const courses = await Course.find({ status: "Published" })
    .populate("instructor", "firstName lastName image")
    .populate("category", "name")
    .lean();

  for (const course of courses) {
    indexCourse(course);
  }

  isReady = true;
  return courses.length;
}

function getSuggestions(prefix, limit = 8) {
  return trie.search(prefix, limit);
}

function ready() {
  return isReady;
}

module.exports = {
  rebuild,
  getSuggestions,
  ready,
};

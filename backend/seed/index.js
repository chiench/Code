import mongoose from "mongoose";
import dotenv from "dotenv";

// Import model schema (giả sử bạn đã export default các schema trong từng file)
import Guide from "../models/Guide.js";
import Invoice from "../models/Invoice.js";
import Itinerary from "../models/Itinerary.js";
import Partner from "../models/Partner.js";
import PartnerType from "../models/PartnerType.js";
import Promotion from "../models/Promotion.js";
import Review from "../models/Review.js";
import Role from "../models/Role.js";
import Service from "../models/Service.js";

import Tour from "../models/Tour.js";
import TourService from "../models/TourService.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import BookingCancellation from "../models/BookingCancellation.js";
import BookingDetail from "../models/BookingDetail.js";
import GroupTourRequest from "../models/GroupTourRequest.js";
import mockData from "./mockData.js";
dotenv.config();
// Map mockData key với model
const modelMap = {
  Guide,
  // Invoice,
  Itinerary,
  Partner,
  PartnerType,
  Promotion,
  Review,

  Service,

  Tour,
  TourService,
  User,
  // Booking,
  BookingCancellation,
  // BookingDetail,
  GroupTourRequest,
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Đã kết nối MongoDB!");

    // Duyệt tất cả các model có dữ liệu
    // 🔹 1. Tạo đủ 3 role nếu chưa có
    const roles = ["admin", "staff", "user"];
    const roleMap = {};

    for (const roleName of roles) {
      const role = await Role.findOneAndUpdate(
        { name: roleName },
        { name: roleName },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      roleMap[roleName] = role._id; // Map name → _id
    }
    for (const [key, Model] of Object.entries(modelMap)) {
      const data = mockData[key];
      if (data && key === "User") {
        // Nếu là user, thì chuyển role từ name → roleId
        data.role = roleMap.staff;
      }
      if (data) {
        await Model.deleteMany({});
        await Model.create(data);
        console.log(`✅ Đã seed ${key}`);
      }
    }

    console.log("🎉 Seed dữ liệu thành công!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Lỗi seed:", err);
    process.exit(1);
  }
}

seed();

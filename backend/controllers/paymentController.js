import moment from "moment";
import {
  sanitizeOrderInfo,
  signVnpayParams,
  verifyVnpaySignature,
} from "../utils/vnpay.js";
import Booking from "../models/Booking.js";
import BookingDetail from "../models/BookingDetail.js";
import Invoice from "../models/Invoice.js";

export const createPaymentUrl = async (req, res) => {
  try {
    // Lấy dữ liệu từ frontend gửi lên
    const { booking, selectedServices, totalPrice, price, tourId, user } =
      req.body;

    // Kiểm tra dữ liệu đầu vào
    const { valid, message } = validateBookingData(
      booking,
      selectedServices,
      totalPrice,
      price,
      tourId
    );
    if (!valid) {
      return res.status(400).json({ message });
    }
    // Tạo một đối tượng Booking
    const bookingData = new Booking({
      tourId: tourId,
      name: booking.name,
      phone: booking.phone,
      startDate: booking.startDate,
      numberOfPeople: booking.numberOfPeople,
      totalPrice: totalPrice, // Tổng giá trị của booking (tour + dịch vụ)
      userId: user._id, // Lưu userId từ payload
    });

    const savedBooking = await bookingData.save();

    // Tạo BookingDetails cho các dịch vụ bổ sung
    const bookingDetailsPromises = selectedServices.map((service) => {
      return new BookingDetail({
        bookingId: savedBooking._id,
        tourServiceId: service.serviceId._id, // Service details
        itemType: "Service",
        description: service.serviceId.description,
        quantity: service.quantity,
        unitPrice: service.servicePrice / service.quantity, // Giá của mỗi dịch vụ
        totalPrice: service.servicePrice, // Tổng giá cho dịch vụ bổ sung
      }).save();
    });

    await Promise.all(bookingDetailsPromises);

    // Tạo Invoice cho việc thanh toán
    const invoice = new Invoice({
      bookingId: savedBooking._id,
      userId: savedBooking.userId, // Giả sử bạn đã có `userId` trong `booking`
      totalAmount: totalPrice, // Tổng tiền cần thanh toán
      discountAmount: 0, // Giả sử chưa có khuyến mãi
      finalAmount: totalPrice, // Giá cuối cùng sau giảm giá (nếu có)
      paymentStatus: "Chưa thanh toán", // Trạng thái thanh toán ban đầu
    });

    const savedInvoice = await invoice.save();

    // Tạo các tham số VNPay
    const ipAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      "127.0.0.1";
    const tmnCode = process.env.VNP_TMNCODE;
    const secretKey = process.env.VNP_HASH_SECRET;
    const vnpUrl = process.env.VNP_URL;
    const returnUrl = `${process.env.CLIENT_URL}/payment-success`;
    const createDate = moment().format("YYYYMMDDHHmmss");
    const orderId = moment().format("HHmmss");

    // Các tham số thanh toán

    const orderInfo = `Thanh toán tour ${savedBooking.name}`;
    const vnp_Params = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: savedInvoice._id.toString(), // Gửi ID của Invoice như là mã giao dịch
      vnp_OrderInfo: sanitizeOrderInfo(orderInfo),
      vnp_OrderType: "billpayment",
      vnp_Amount: totalPrice * 100, // Đơn vị tiền tệ là VND (VNPay yêu cầu phải nhân với 100)
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
    };

    // 🔐 Ký các tham số (phải encode giá trị)
    const signedHash = signVnpayParams(vnp_Params, secretKey);
    vnp_Params.vnp_SecureHash = signedHash;

    // 🔗 Tạo URL thanh toán (encode giá trị đúng chuẩn)
    const querystring = Object.entries(vnp_Params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    const paymentUrl = `${vnpUrl}?${querystring}`;

    return res.json({ paymentUrl });
  } catch (error) {
    console.error("Lỗi khi tạo URL thanh toán: ", error);
    return res.status(500).json({ message: "Có lỗi xảy ra", error });
  }
};

const validateBookingData = (
  booking,
  selectedServices,
  totalPrice,
  price,
  tourId
) => {
  if (
    !booking ||
    !booking.name ||
    !booking.phone ||
    !booking.startDate ||
    !booking.numberOfPeople
  ) {
    return { valid: false, message: "Thông tin đặt tour không đầy đủ!" };
  }

  if (!selectedServices || selectedServices.length === 0) {
    return { valid: false, message: "Cần phải chọn ít nhất một dịch vụ!" };
  }

  if (!totalPrice || totalPrice <= 0) {
    return {
      valid: false,
      message: "Tổng giá trị của booking không hợp lệ!",
    };
  }

  if (!price || price <= 0) {
    return { valid: false, message: "Giá thanh toán không hợp lệ!" };
  }

  if (!tourId) {
    return { valid: false, message: "ID tour không hợp lệ!" };
  }

  return { valid: true };
};

export const vnpayIpnHandler = async (req, res) => {
  console.log("Đang xử lý cập nhật hóa đơn (Invoice) ");
  try {
    // Lấy các tham số từ query string VNPay gửi về
    const vnp_Params = req.query;

    // Kiểm tra chữ ký của VNPay để đảm bảo tính hợp lệ của callback
    const isValid = verifyVnpaySignature(vnp_Params);
    if (!isValid) {
      return res.status(400).json({ message: "Chữ ký VNPay không hợp lệ!" });
    }

    // Lấy thông tin từ callback
    const { vnp_TxnRef, vnp_ResponseCode, vnp_Amount } = vnp_Params;
    const paymentStatus =
      vnp_ResponseCode === "00" ? "Đã thanh toán" : "Thất bại";

    // Lấy hóa đơn từ txnRef (dùng txnRef làm tham chiếu để tìm invoice)
    const invoice = await Invoice.findById(vnp_TxnRef);
    if (!invoice) {
      return res.status(404).json({ message: "Hóa đơn không tồn tại!" });
    }

    // Cập nhật trạng thái thanh toán trong Invoice
    invoice.paymentStatus = paymentStatus;
    invoice.finalAmount = vnp_Amount / 100; // VNPay trả tiền theo đơn vị tiền tệ nhỏ nhất (VND)

    await invoice.save();

    // Nếu thanh toán thành công, cập nhật trạng thái của Booking
    if (paymentStatus === "Đã thanh toán") {
      const booking = await Booking.findById(invoice.bookingId);
      booking.status = "Đang xử lý"; // Cập nhật trạng thái Booking thành "Đã xác nhận"
      await booking.save();
    }
    console.log("Cập nhật hóa đơn (Invoice) thành công ");
    // Trả về phản hồi cho VNPay
    res.status(200).json({
      message: "Thanh toán đã được xử lý thành công.",
    });
  } catch (error) {
    console.error("Lỗi khi xử lý callback thanh toán VNPay:", error);
    res.status(500).json({ message: "Lỗi hệ thống", error });
  }
};

package com.billing.pos.dto;

import lombok.Data;

@Data
public class GalleryPhotoData {
    private Long billId;
    private String billDisplay;
    private String date;
    private String customerName;
    private String itemName;
    private Double metalWt;
    private String fileName;
}
